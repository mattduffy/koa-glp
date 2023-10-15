/**
 * @summary Koa router for editing the main top-level pages.
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/edit-pier.js The router for editing the top level app URLs.
 */

import Router from '@koa/router'
import { ulid } from 'ulid'
import formidable from 'formidable'
// import { Albums } from '@mattduffy/albums/Albums' // eslint-disable-line import/no-unresolved
// import { AggregateGroupByReducers, AggregateSteps } from 'redis'
import {
  _log,
  _info,
  _error,
  getSetName,
} from '../utils/logging.js'
import { redis } from '../daos/impl/redis/redis-om.js'
// import { redis as ioredis } from '../daos/impl/redis/redis-client.js'

const editLog = _log.extend('edit')
const editInfo = _info.extend('edit')
const editError = _error.extend('edit')
/* eslint-disable-next-line no-unused-vars */
function sanitize(param) {
  // fill in with some effective input scubbing logic
  return param
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

router.get('editPier-GET', '/edit/pier/:pier', hasFlash, async (ctx) => {
  const log = editLog.extend('GET-editPier')
  const info = editInfo.extend('INFO-editPier')
  const error = editError.extend('GET-editPier')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    const pierNumber = sanitize(ctx.params.pier)
    const locals = {}
    let key = `glp:piers:${pierNumber}`
    let pier
    let town
    info(pierNumber)
    if (pierNumber.length > 6 || !/^\d/.test(pierNumber)) {
      error('Pier number looks invalid')
      error(pierNumber.length, !/^\d/.test(pierNumber))
      locals.pier = `${pierNumber} is not a valid pier number.`
    }
    let setTown
    try {
      /* eslint-disable-next-line */
      for (const set of ctx.state.TOWNS) {
        let found = false
        const setkey = `glp:piers_by_town:${set}`
        log(setkey, pierNumber)
        /* eslint-disable-next-line */
        for await (const { value } of redis.zScanIterator(setkey, { MATCH: pierNumber, COUNT: 900 })) {
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
      nextPier = await redis.zRange(key, `[${pierNumber}`, '+', { BY: 'LEX', LIMIT: { offset: 1, count: 1 } })
      if (Number.isNaN(parseInt(nextPier, 10))) {
        nextPier = '001'
      }
      log(`next pier >> ${nextPier}`)
    } catch (e) {
      error(e)
      throw new Error(`Failed creating next pier link for pier ${pierNumber}`, { cause: e })
    }
    try {
      previousPier = await redis.zRange(key, `[${pierNumber}`, '-', { BY: 'LEX', REV: true, LIMIT: { offset: '1', count: '1' } })
      if (Number.isNaN(parseInt(previousPier, 10))) {
        previousPier = await redis.zRange(key, '0', '-1', { REV: true, BY: 'SCORE', LIMIT: { offset: '0', count: '1' } })
      }
      log(`prev pier >> ${previousPier}`)
    } catch (e) {
      error(e)
      throw new Error(`Failed creating previous pier link for pier ${pierNumber}`, { cause: e })
    }
    const csrfToken = ulid()
    ctx.session.csrfToken = csrfToken
    ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
    locals.jwtAccess = ctx.state.searchJwtAccess
    locals.csrfToken = csrfToken
    locals.town = town
    locals.pier = pier
    locals.lon = lon
    locals.lat = lat
    locals.photo = false
    locals.setTown = setTown
    locals.pierNumber = pierNumber
    locals.nextPier = nextPier
    locals.previousPier = previousPier
    locals.flash = ctx.flash.view ?? {}
    locals.title = `${ctx.app.site}: Pier ${pierNumber}`
    locals.sessionUser = ctx.state.sessionUser
    locals.isAuthenticated = ctx.state.isAuthenticated
    await ctx.render('edit-pier', locals)
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
    const pierNumber = sanitize(ctx.params.pier)
    const locals = {}
    let key = `glp:piers:${pierNumber}`
    let pier
    // let town
    // let setTown
    info(pierNumber)
    if (pierNumber.length > 6 || !/^\d/.test(pierNumber)) {
      error('Pier number looks invalid')
      error(pierNumber.length, !/^\d/.test(pierNumber))
      locals.pier = `${pierNumber} is not a valid pier number.`
    }
    const form = formidable({
      encoding: 'utf-8',
      uploadDir: ctx.app.uploadsDir,
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
        info(fields)
        info(files)
        resolve()
      })
    })
    const csrfTokenCookie = ctx.cookies.get('csrfToken')
    const csrfTokenSession = ctx.session.csrfToken
    const { csrfTokenHidden } = ctx.request.body
    if (csrfTokenCookie === csrfTokenSession && csrfTokenSession === csrfTokenHidden) {
      error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
      ctx.type = 'application/json; charset=utf-8'
      ctx.status = 401
      ctx.body = { error: 'csrf token mismatch' }
    } else {
      const update = (new Date()).toJSON()
      const updatedPier = ctx.state.fields.pier
      pier.updatedOn = []
      pier.updatedOn.push(update)
      info(pierNumber)
      info(ctx.request.body)
      ctx.type = 'application/json; charset=utf-8'
      ctx.status = 200
      ctx.body = { pier: updatedPier, files: ctx.state.files }
    }
  }
})

router.post('geohash', '/edit/geohash', async (ctx) => {
  const log = _log.extend('geohash')
  const info = _info.extend('geohash')
  const error = _error.extend('geohash')
  if (!ctx.state.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    const form = formidable({
      encoding: 'utf-8',
      uploadDir: ctx.app.uploadsDir,
      keepExtensions: true,
      multipart: true,
    })
    // form.type = 'urlencoded'
    await new Promise((resolve, reject) => {
      form.parse(ctx.req, (err, fields) => {
        if (err) {
          error('There was a problem parsing the multipart form data.')
          error(err)
          reject(err)
          return
        }
        log('Multipart form data was successfully parsed.')
        ctx.state.fields = fields
        info(fields)
        resolve()
      })
    })
    const csrfTokenCookie = ctx.cookies.get('csrfToken')
    const csrfTokenSession = ctx.session.csrfToken
    const [csrfTokenHidden] = ctx.state.fields.csrfTokenHidden
    info(`${csrfTokenCookie},\n${csrfTokenSession},\n${csrfTokenHidden}`)
    if (csrfTokenCookie === csrfTokenSession) info('cookie === session')
    if (csrfTokenSession === csrfTokenHidden) info('session === hidden')
    if (csrfTokenCookie === csrfTokenHidden) info('cookie === hidden')
    if (!(csrfTokenCookie === csrfTokenSession && csrfTokenSession === csrfTokenHidden)) {
      error(`CSRF-Token mismatch: header:${csrfTokenCookie} hidden:${csrfTokenHidden} - session:${csrfTokenSession}`)
      ctx.type = 'application/json; charset=utf-8'
      ctx.status = 401
      ctx.body = { error: 'csrf token mismatch' }
    } else {
      info(`pier: ${ctx.state.fields.pier[0]}`)
      info(`csrf: ${ctx.state.fields.csrfTokenHidden[0]}`)
      info(`lon: ${ctx.state.fields.lon[0].toString()}`)
      info(`lat: ${ctx.state.fields.lat[0].toString()}`)
      const lon = ctx.state.fields.lon[0].toString()
      const lat = ctx.state.fields.lat[0].toString()
      const pier = ctx.state.fields.pier[0].toString()
      const coords = { longitude: lon, latitude: lat, member: pier }
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
      ctx.type = 'application/json; charset=utf-8'
      ctx.status = 200
      ctx.body = {
        pier,
        geoHash: geoHash[0],
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
  locals.title = `${ctx.app.site}: Home`
  locals.sessionUser = ctx.state.sessionUser
  locals.isAuthenticated = ctx.state.isAuthenticated
  locals.items = items
  locals.nullisland = items[0].list
  await ctx.render('nullisland', locals)
})

export { router as edit }
