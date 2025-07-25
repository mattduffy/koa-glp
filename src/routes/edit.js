/**
 * @summary Koa router for editing the main top-level pages.
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/edit.js
 */

import path from 'node:path'
import { Buffer } from 'node:buffer'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import Router from '@koa/router'
import { ulid } from 'ulid'
import formidable from 'formidable'
import { processFormData, doTokensMatch } from './middlewares.js'
import {
  _log,
  _info,
  _error,
  // getSetName,
  getTownDirName,
} from '../utils/logging.js'
import { redis } from '../daos/impl/redis/redis-om.js'
// import { redis as ioredis } from '../daos/impl/redis/redis-client.js'
// import { AggregateGroupByReducers, AggregateSteps } from 'redis'

const editLog = _log.extend('edit')
const editInfo = _info.extend('edit')
const editError = _error.extend('edit')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.resolve(`${__dirname}/../..`)
const appEnv = {}
editLog(`appRoot: ${appRoot}`)
dotenv.config({ path: path.resolve(appRoot, 'config/app.env'), processEnv: appEnv })

function sanitize(param) {
  // fill in with some effective input scrubbing logic
  return param
}

// Null Island check
async function isPierNullIsland(pierNumber) {
  let isNullIsland = false
  const nullIslandIterator = await redis.zScanIterator('glp:null_island', { MATCH: pierNumber, COUNT: 1 })
  /* eslint-disable-next-line */
  for await(const { score, value } of nullIslandIterator) {
    if (value === pierNumber) {
      isNullIsland = true
    }
  }
  return isNullIsland
}

// Get Town name for pier number
async function townForPier(pierNumber, townsArray) {
  const log = editLog.extend('townForPier')
  const error = editError.extend('townForPier')
  let setTown
  let town
  try {
    /* eslint-disable-next-line */
    for (const set of townsArray) {
      let found = false
      const setkey = `glp:piers_by_town:${set}`
      log(setkey, pierNumber)
      /* eslint-disable-next-line */
      for await (const { value } of redis.zScanIterator(setkey, { MATCH: pierNumber, COUNT: 1000 })) {
        if (value !== null) {
          town = set.split('_').map((e) => e.toProperCase()).join(' ')
          setTown = set
          log(`Found ${value} in ${set}`)
          found = true
        }
      }
      if (found) break
    }
  } catch (e) {
    error(e)
    throw new Error(`Could not match pier ${pierNumber} to any town set in redis.`, { cause: e })
  }
  return { setTown, town }
}

// Generate geoJSON polygons
async function generateGeoJSON(s) {
  const log = editLog.extend('generateGeoJSON')
  // const error = editError.extend('generateGeoJSON')
  if (s === null || s === undefined) {
    throw new Error('Missing required town name.')
  }
  const name = s.slice(s.lastIndexOf(':'))
  const geojson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          id: name,
          name,
          numberOfPiers: 0,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[]],
        },
      },
    ],
  }
  log(`using redis set ${s}`)
  const piers = await redis.zRange(s, 0, -1)
  const setSize = await redis.zCard(s)
  geojson.features[0].properties.numberOfPiers = setSize
  log(piers, piers.length, setSize)
  let firstPier = null
  let nullIsland = 0
  let x = 0
  if (piers.length > 0) {
    /* eslint-disable-next-line */
    for await (const p of piers) {
      const key = `glp:piers:${p}`
      // log(p, key)
      const pier = await redis.json.get(key)
      const loc = pier.loc.split(',')
      loc[0] = parseFloat(loc[0])
      loc[1] = parseFloat(loc[1])
      if (firstPier === null) {
        firstPier = loc
      }
      if (loc[0] === 0 || loc[1] === 0) {
        nullIsland += 1
      } else {
        geojson.features[x].geometry.coordinates[0].push(loc)
      }
    }
    // williams bay correction points
    // [-88.54234, 42.563805]
    // [-88.52719, 42.565257]
    if (/williams/.test(s)) {
      geojson.features[x].geometry.coordinates[0].push([-88.54234, 42.563805])
      geojson.features[x].geometry.coordinates[0].push([-88.52719, 42.565257])
    }
    // walworth correction points
    // [-88.564359,42.561333],
    // [-88.56213,42.562485],
    if (/walworth/.test(s)) {
      geojson.features[x].geometry.coordinates[0].push([-88.564359, 42.561333])
      geojson.features[x].geometry.coordinates[0].push([-88.56213, 42.562485])
    }
    geojson.features[x].geometry.coordinates[0].push(firstPier)
    geojson.features[x].properties.nullIslands = nullIsland
    x += 1
  }
  return geojson
}

// Generate geoJSON polygons
async function generateCombinedGeoJSON(s, t) {
  const TOWNS = t
  const combinedGeoJson = {
    type: 'FeatureCollection',
    features: [
    ],
  }
  /* eslint-disable-next-line */
  for await (const t of TOWNS) {
    const setName = `glp:piers_by_town:${t}`
    const townGeoj = await generateGeoJSON(setName)
    combinedGeoJson.features.push(townGeoj.features[0])
    // const rSaved = await redis.json.set(`glp:geojson:${t}`, '$', combinedGeoj)
  }
  // console.log(combinedGeoJson, { depth: null })
  return combinedGeoJson
}

// Save geoJSON data to a file.
async function saveGeoJsonFile(data, town) {
  const log = editLog.extend('saveGeoJsonFile')
  const filePath = path.resolve(appRoot, 'data', 'geojson', `${town}.geojson`)
  log(`geojson save path: ${filePath}`)
  const geojsonData = new Uint8Array(Buffer.from(JSON.stringify(data, null, 2)))
  const file = await writeFile(filePath, geojsonData)
  return file
}

// Save pier data to a file.
async function savePierFile(dir, data) {
  const log = editLog.extend('savePierFile')
  const pier = data
  if (!data.loc?.longitude || data.loc?.longitude === undefined) {
    console.log(`Pier location as a string: ${data.loc}`)
    const [longitude, latitude] = data.loc.split(',')
    const tempLoc = { longitude: parseFloat(longitude), latitude: parseFloat(latitude) }
    console.log(`Pier location normalized: ${data.loc}`)
    pier.loc = tempLoc
  }
  const pierFile = `pier-${data.pier}.json`
  const filePath = path.resolve(appRoot, 'data/v1', dir, pierFile)
  log(`pier file save path: ${filePath}`)
  const pierData = new Uint8Array(Buffer.from(JSON.stringify(data, null, 2)))
  const file = await writeFile(filePath, pierData)
  return file
}

async function getNextRedisJsonKey(keyPattern) {
  const log = editLog.extend('getNextRedisJsonKey')
  const error = editError.extend('getNextRedisJsonKey')
  let highestKey = 0
  try {
    const scanOpts = {
      MATCH: keyPattern,
      COUNT: 2000,
    }
    /* eslint-disable-next-line */
    for await (const key of redis.scanIterator(scanOpts)) {
      log('key', key)
      const keyNum = Number.parseInt(key.split(':').pop(), 10)
      if (!Number.isNaN(keyNum) && keyNum > highestKey) {
        highestKey = keyNum
        log('keyNum', keyNum)
        log('highestKey', highestKey)
      }
    }
    const nextKey = highestKey + 1
    const paddedNextKey = nextKey.toString().padStart(3, 0)
    log('paddedNextKey', paddedNextKey)
    return paddedNextKey
  } catch (e) {
    error(e)
    return false
  }
}

const router = new Router()

async function hasFlash(ctx, next) {
  const log = editLog.extend('hasFlash')
  const error = editError.extend('hasFlash')
  if (ctx.flash) {
    log('ctx.flash is present: %o', ctx.flash)
  } else {
    error('ctx.flash is missing.')
  }
  await next()
}

router.post('newPoi-POST', '/new/poi', processFormData, async (ctx) => {
  const log = editLog.extend('POST-newPoi')
  const error = editError.extend('POST-newPoi')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    let body
    const newCsrfToken = ulid()
    const [csrfTokenHidden] = ctx.request.body.csrfTokenHidden
    log(`csrfTokenHidden: ${csrfTokenHidden}`)
    ctx.cookies.set('csrfToken', newCsrfToken, { httpOnly: true, sameSite: 'strict' })
    if (!doTokensMatch(ctx)) {
      ctx.body = {
        status: 'fail',
        message: 'csrf tokens do not match',
        csrfToken: newCsrfToken,
      }
    } else {
      log(ctx.request.body)
      let newPoi
      const DB_PREFIX = 'glp:pois'
      const id = await getNextRedisJsonKey(`${DB_PREFIX}:???`)
      log('next id', id)
      const poi = JSON.parse(ctx.request.body.poi[0])
      poi.properties.id = Number.parseInt(`${id}`, 10)
      log('poi json', poi)
      try {
        newPoi = await redis.json.set(`${DB_PREFIX}:${id}`, '$', poi)
        log(newPoi)
      } catch (e) {
        error(e)
        error('Failed to save poi json.')
        body = {
          status: 'fail',
          message: 'Failed to save new poi.',
          cause: e,
          newCsrfToken,
        }
      }
      ctx.session.csrfToken = newCsrfToken
      ctx.cookies.set('csrfToken', newCsrfToken, { httpOnly: true, sameSite: 'strict' })
      // body = ctx.request.body
      body = { status: 'success', message: 'new poi created', newCsrfToken }
      ctx.body = body
    }
  }
})

router.post('editPoi-POST', '/edit/poi', processFormData, async (ctx) => {
  const log = editLog.extend('POST-editPOI')
  const error = editError.extend('POST-editPOI')
  if (!ctx.state.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    let body
    const newCsrfToken = ulid()
    log('newCsrfToken', newCsrfToken)
    // const [csrfTokenHidden] = ctx.request.body.csrfTokenHidden
    if (!doTokensMatch(ctx)) {
      ctx.cookies.set('csrfToken', newCsrfToken, { httpOnly: true, sameSite: 'strict' })
      ctx.session.csrfToken = newCsrfToken
      body = {
        status: 'fail',
        message: 'csrf tokens do not match',
        csrfToken: newCsrfToken,
      }
      ctx.body = body
    } else {
      log(ctx.request.body)
      try {
        const DB_PREFIX = 'glp:pois'
        const poi = JSON.parse(ctx.request.body.poi[0])
        if (!poi.properties?.updatedOn) {
          poi.properties.updatedOn = []
        }
        poi.properties.updatedOn.push(new Date())
        const id = Number(poi.properties.id).toString().padStart(3, 0)
        poi.properties.id = Number.parseInt(poi.properties.id, 10)
        const savedPoi = await redis.json.set(`${DB_PREFIX}:${id}`, '$', poi)
        log('savedPoi', savedPoi)
        body = {
          status: 'success',
          message: 'Successfully updated poi.',
          poi,
          csrfToken: newCsrfToken,
        }
      } catch (e) {
        error('Failed to save edited POI.')
        error(e)
        body = {
          status: 'fail',
          message: 'Failed to save edited POI.',
          cause: e,
          newCsrfToken,
        }
      }
      ctx.cookies.set('csrfToken', newCsrfToken, { httpOnly: true, sameSite: 'strict' })
      ctx.session.csrfToken = newCsrfToken
      ctx.body = body
    }
  }
})

router.get('editPOI-GET', '/edit/poi/:placeId', hasFlash, async (ctx) => {
  const log = editLog.extend('GET-editPOI')
  const error = editError.extend('GET-editPOI')
  const placeId = sanitize(ctx.params.placeId.toUpperCase())
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    log('placeId', placeId)
    let poi
    let nextPOI
    let previousPOI
    const newCsrfToken = ulid()
    const locals = {}
    try {
      const dialect = 2
      const opts = {
        // SORTBY: {
        //   BY: 'id',
        //   DIRECTION: 'ASC',
        // },
        RETURN: ['$'],
        DIALECT: dialect,
        PARAMS: { placeId },
      }
      const query = `@placeId:(${opts.PARAMS.placeId})`
      poi = await redis.ft.search('glp:idx:pois:placeId', query, opts)
      log(poi.documents[0].value)
    } catch (e) {
      error('Failed to retrieve poi with placeId ', placeId)
      error(e)
    }
    ctx.session.csrfToken = newCsrfToken
    ctx.cookies.set('csrfToken', newCsrfToken, { httpOnly: true, sameSite: 'strict' })
    locals.jwtAccess = ctx.state.searchJwtAccess
    locals.csrfToken = newCsrfToken
    locals.poi = poi.documents[0].value;
    [locals.lon, locals.lat] = poi.documents[0].value.geometry.coordinates
    locals.nextPOI = nextPOI
    locals.previousPOI = previousPOI
    locals.flash = ctx.flash.view ?? {}
    locals.title = `${ctx.app.site}: Point of Interest - ${poi.name}`
    locals.sessionUser = ctx.state.sessionUser
    locals.isAuthenticated = ctx.state.isAuthenticated
    await ctx.render('poi-edit', locals)
  }
})

router.get('editPier-GET', '/edit/pier/:pier', hasFlash, async (ctx) => {
  const log = editLog.extend('GET-editPier')
  const info = editInfo.extend('INFO-editPier')
  const error = editError.extend('GET-editPier')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    const pierNumber = sanitize(ctx.params.pier.toUpperCase())
    const locals = {}
    let key = `glp:piers:${pierNumber}`
    let pier
    info(pierNumber)
    if (pierNumber.length > 6 || !/^\d/.test(pierNumber)) {
      error('Pier number looks invalid')
      error(pierNumber.length, !/^\d/.test(pierNumber))
      locals.pier = `${pierNumber} is not a valid pier number.`
    }
    const town = await townForPier(pierNumber, ctx.state.TOWNS)
    let lon
    let lat
    try {
      pier = await redis.json.get(key)
      locals.pier = pier;
      [lon, lat] = pier.loc.split(',')
      log(pier)
    } catch (e) {
      error(e)
      throw new Error(`Failed to get pier ${pierNumber}`, { cause: e })
    }
    let nextPier
    let previousPier
    key = 'glp:all_piers_in_order'
    try {
      // const args = [key, '[643', '+', 'bylex', 'limit', '1', '1']
      nextPier = await redis.zRange(
        key,
        `[${pierNumber}`,
        '+',
        { BY: 'LEX', LIMIT: { offset: 1, count: 1 } },
      )
      if (Number.isNaN(parseInt(nextPier, 10))) {
        nextPier = '001'
      }
      log(`next pier >> ${nextPier}`)
    } catch (e) {
      error(e)
      throw new Error(
        `Failed creating next pier link for pier ${pierNumber}`,
        { cause: e },
      )
    }
    try {
      previousPier = await redis.zRange(
        key,
        `[${pierNumber}`,
        '-',
        { BY: 'LEX', REV: true, LIMIT: { offset: '1', count: '1' } },
      )
      if (Number.isNaN(parseInt(previousPier, 10))) {
        previousPier = await redis.zRange(
          key,
          '0',
          '-1',
          { REV: true, BY: 'SCORE', LIMIT: { offset: '0', count: '1' } },
        )
      }
      log(`prev pier >> ${previousPier}`)
    } catch (e) {
      error(e)
      throw new Error(
        `Failed creating previous pier link for pier ${pierNumber}`,
        { cause: e },
      )
    }
    const csrfToken = ulid()
    ctx.session.csrfToken = csrfToken
    ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
    locals.jwtAccess = ctx.state.searchJwtAccess
    locals.csrfToken = csrfToken
    locals.town = town.town
    locals.pier = pier
    locals.lon = lon
    locals.lat = lat
    locals.photo = false
    locals.setTown = town.setTown
    locals.pierNumber = pierNumber
    locals.nextPier = nextPier
    locals.previousPier = previousPier
    locals.flash = ctx.flash.view ?? {}
    locals.title = `${ctx.app.site}: Pier ${pierNumber}`
    locals.sessionUser = ctx.state.sessionUser
    locals.isAuthenticated = ctx.state.isAuthenticated
    await ctx.render('pier-edit', locals)
  }
})

router.post('postEdit', '/edit/pier/:pier', hasFlash, async (ctx) => {
  const log = editLog.extend('POST-editPier')
  const info = editInfo.extend('POST-editPier')
  const error = editError.extend('POST-editPier')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    const locals = {}
    const pierNumber = sanitize(ctx.params.pier)
    info(pierNumber)
    if (pierNumber.length > 6 || !/^\d/.test(pierNumber)) {
      error('Pier number looks invalid')
      error(pierNumber.length, !/^\d/.test(pierNumber))
      locals.pier = `${pierNumber} is not a valid pier number.`
    }
    // const key = `glp:piers:${pierNumber}`
    // let pierCurrent
    // try {
    //   pierCurrent = await redis.json.get(key, pierNumber)
    // } catch (e) {
    //   error(`Failed to retrieve pier ${pierNumber} from redis.`)
    //   error(e)
    // }
    info(`ctx.app.dirs.private.uploads: ${ctx.app.dirs.private.uploads}`)
    const form = formidable({
      encoding: 'utf-8',
      uploadDir: ctx.app.dirs.private.uploads,
      keepExtensions: true,
      multipart: true,
    })
    // form.type = 'urlencoded'
    await new Promise((resolve, reject) => {
      form.parse(ctx.req, (err, fields, files) => {
        if (err) {
          error('There was a problem parsing the multipart form data.')
          error(err)
          reject(err)
          return
        }
        log('Multipart form data was successfully parsed.')
        ctx.state.fields = fields
        ctx.state.files = files
        info(`form fields: ${fields}`)
        info(`form files: ${files}`)
        resolve()
      })
    })
    let okNullIsland = false
    let okCombinedGeoJson = false
    let okTownGeoJson = false
    let okPierImage = false
    let okPierUpdate = false
    const csrfTokenCookie = ctx.cookies.get('csrfToken')
    const csrfTokenSession = ctx.session.csrfToken
    const [csrfTokenHidden] = ctx.state.fields.csrfTokenHidden
    info(`${csrfTokenCookie},\n${csrfTokenSession},\n${csrfTokenHidden}`)
    if (csrfTokenCookie === csrfTokenSession) info('cookie === session')
    if (csrfTokenSession === csrfTokenHidden) info('session === hidden')
    if (csrfTokenCookie === csrfTokenHidden) info('cookie === hidden')
    if (!(csrfTokenCookie === csrfTokenSession && csrfTokenSession === csrfTokenHidden)) {
      error(`CSRF-Token mismatch: header:${csrfTokenCookie} hidden:${csrfTokenHidden} - session:${csrfTokenSession}`)
      error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
      ctx.type = 'application/json; charset=utf-8'
      ctx.status = 401
      ctx.body = { error: 'csrf token mismatch' }
    } else {
      let pierUpdated = ctx.state.fields.pier[0]
      pierUpdated = JSON.parse(pierUpdated)
      console.log(pierUpdated, { depth: null })
      const setTown = ctx.state.fields.setTown[0]
      // Null Island check
      const pierCurrentNullIsland = await isPierNullIsland(pierNumber)
      const [lonU, latU] = pierUpdated.loc.split(',')
      const pierUpdatedNotNullIsland = (parseFloat(lonU) !== 0 && parseFloat(latU) !== 0)
      //
      // Save pierUpdated to redis as pier.
      // Do this before regenerating geoJSON files.
      //
      if (pierUpdated.updatedOn === undefined) {
        pierUpdated.updatedOn = []
      }
      pierUpdated.updatedOn.unshift((new Date()).toJSON())
      const pierSaved = await redis.json.set(`glp:piers:${pierNumber}`, '$', pierUpdated)
      info(pierNumber, pierSaved)
      // Save updated pier to file in <appRoot>/data/v1/<town> directory
      const dir = getTownDirName(setTown, pierNumber)
      info(`saving updated pier data in dir: ${dir}`)
      let savedFile
      try {
        savedFile = await savePierFile(dir, pierUpdated)
        info(savedFile)
        okPierUpdate = true
      } catch (e) {
        error(e)
        okPierUpdate = false
      }
      if (pierCurrentNullIsland && pierUpdatedNotNullIsland) {
        // remove pier from glp:null_island zset
        try {
          const zrem = await redis.zRem('glp:null_island', pierNumber)
          info(`removed pier ${pierNumber} from null island set: ${zrem}`)
          // Use setTown to generate geoJSON data
          const setKey = `glp:piers_by_town:${setTown}`
          info(`using ${setKey} to re-generate geoJSON data for ${setTown}`)
          const geoj = await generateGeoJSON(setKey)
          info(`geoJSON for ${setTown}:`, geoj)
          const rSaved = await redis.json.set(`glp:geojson:${setTown}`, '$', geoj)
          // Use setTown to save geoJSON data to redis set
          info(`geojson saved to glp:geojson:${setTown}: ${rSaved}`)
          await saveGeoJsonFile(geoj, setTown)
          okTownGeoJson = true
          okNullIsland = true
        } catch (e) {
          error(e)
          okNullIsland = false
          okTownGeoJson = 'maybe'
        }
        // Regenerate the combined geoJSON data and save to file.
        try {
          const setKey = 'glp:geojson:combined_geneva_lake'
          info(`using ${setKey} to re-generate combinded geoJSON data`)
          const combinedGeoj = await generateCombinedGeoJSON(setKey, ctx.state.TOWNS)
          info('combined geoJSON:', combinedGeoj)
          const rSaved = await redis.json.set(setKey, '$', combinedGeoj)
          // Use setKey to save combined geoJSON data to redis set
          info(`combined geojson saved to ${setKey}: ${rSaved}`)
          await saveGeoJsonFile(combinedGeoj, 'combined_geneva_lake')
          okCombinedGeoJson = true
        } catch (e) {
          error(e)
          okCombinedGeoJson = false
        }
      } else {
        okNullIsland = 'maybe'
      }
      //
      // Save uploaded image file
      //
      let fileUploadStatus = 'failed'
      if (ctx.state.files?.photo_0 && ctx.state.files?.photo_0?.length > 0) {
        log(ctx.state.files.photo_0)
        if (pierUpdated.images === undefined) {
          pierUpdated.images = []
        }
        const pierImage = ctx.state.files.photo_0[0]
        const fileExt = pierImage.newFilename.substr(pierImage.newFilename.lastIndexOf('.') + 1)
        const imgSrc = `i/piers/${pierNumber}/image_${pierUpdated.images.length}.${fileExt}`
        // const savePath = `${ctx.app.dirs.public.images}/${imgSrc}`
        const savePath = `${ctx.app.dirs.public.images}/piers/${pierNumber}`
        try {
          const mkdirResult = await mkdir(savePath, { recursive: true })
          info(`mkdirResult: ${mkdirResult}`)
          await rename(pierImage.filepath, `${savePath}/image_${pierUpdated.images.length}.${fileExt}`)
          fileUploadStatus = 'success'
          info(`${fileUploadStatus} - saved new pier ${pierUpdated.pier} photo: ${savePath}/image_${pierUpdated.images.length}.${fileExt}`)
          pierUpdated.images.unshift(imgSrc)
          okPierImage = true
        } catch (e) {
          error(e)
          okPierImage = false
        }
      } else {
        okPierImage = 'ok, no image uploaded'
      }
      info(`Is update for pier ${pierNumber} OK TO GO?`)
      info(`pier update: ${okPierUpdate}`)
      info(`pier image: ${okPierImage}`)
      info(`Null Island: ${okNullIsland}`)
      if (!okPierUpdate || !okPierImage || !okNullIsland) {
        ctx.type = 'application/json; charset=utf-8'
        ctx.status = 200
        ctx.body = {
          status: 'update failed',
          msg: 'Failed to update pier.',
          okTownGeoJson,
          okCombinedGeoJson,
          okPierUpdate,
          okPierImage,
        }
      } else {
        ctx.type = 'application/json; charset=utf-8'
        ctx.status = 200
        ctx.body = {
          status: 'ok',
          setTown,
          okTownGeoJson,
          okCombinedGeoJson,
          pier: pierUpdated,
          imageUploadStatus: okPierImage,
        }
      }
    }
  }
})

router.post('geohash', '/edit/geohash', processFormData, async (ctx) => {
  const log = editLog.extend('geohash')
  const info = editInfo.extend('geohash')
  const error = editError.extend('geohash')
  if (!ctx.state.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    log('form values:', ctx.request.body)
    const csrfTokenCookie = ctx.cookies.get('csrfToken')
    const csrfTokenSession = ctx.session.csrfToken
    const { csrfTokenHidden } = ctx.request.body
    info(`${csrfTokenCookie},\n${csrfTokenSession},\n${csrfTokenHidden}`)
    if (!doTokensMatch(ctx)) {
      error(`CSRF-Token mismatch: header:${csrfTokenCookie} hidden:${csrfTokenHidden} - session:${csrfTokenSession}`)
      ctx.type = 'application/json; charset=utf-8'
      ctx.status = 401
      ctx.body = { error: 'csrf token mismatch' }
    } else {
      const { lon, lat } = ctx.request.body
      const pier = ctx.request.body.pier[0]
      const coords = { longitude: lon, latitude: lat, member: pier }
      log(coords)
      let geoAdd
      let geoHash
      try {
        // geoAdd = await redis.geoAdd('glp:piers:geohashes', coords, { NX: true })
        // geoAdd = await redis.geoAdd('glp:piers:geohashes', coords, { CH: true })
        geoAdd = await redis.geoAdd('glp:piers:geohashes', coords)
        geoHash = await redis.geoHash('glp:piers:geohashes', pier)
      } catch (e) {
        error(e)
        geoAdd = e.message
        geoHash = 0
      }
      info(`geoAdd result: ${geoAdd}`)
      info(`geoHash result: ${geoHash}`)
      const newCsrfToken = ulid()
      ctx.session.csrfToken = newCsrfToken
      ctx.cookies.set('csrfToken', newCsrfToken, { httpOnly: true, sameSite: 'strict' })
      ctx.type = 'application/json; charset=utf-8'
      ctx.status = 200
      ctx.body = {
        pier,
        geoHash: geoHash[0],
        newCsrfToken,
      }
    }
  }
})

router.get('nullIsland', '/nullisland', hasFlash, async (ctx) => {
  const log = _log.extend('nullisland')
  // const info = _info.extend('nullisland')
  // const error = _error.extend(nullisland')
  log('inside edigt router: /nullisland')
  ctx.status = 200
  const locals = {}
  const items = []
  if (ctx.state.isAuthenticated) {
    log(`sessionUser.isAuthenticated: ${ctx.state.isAuthenticated}`)
    // get the list of null_island piers
    const key = 'glp:null_island'
    const nullIsland = await redis.zRange(key, '-', '+', { BY: 'LEX' })
    log(nullIsland)
    if (nullIsland.length > 0) {
      items.push({ title: 'Piers assigned to Null Island.', list: nullIsland })
    }
  }
  const csrfToken = ulid()
  ctx.session.csrfToken = csrfToken
  ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
  locals.csrfToken = csrfToken
  locals.body = ctx.body
  locals.flash = ctx.flash?.index ?? {}
  locals.title = `${ctx.app.site}: All the null island piers.`
  locals.sessionUser = ctx.state.sessionUser
  locals.isAuthenticated = ctx.state.isAuthenticated
  locals.items = items
  locals.nullisland = items[0].list
  await ctx.render('nullisland', locals)
})

export { router as edit }
