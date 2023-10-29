/**
 * @summary Koa router for the apple mapkit api endpoints.
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/mapkit.js The router for the apple mapkit api endpoints.
 */

import Router from '@koa/router'
// import { ulid } from 'ulid'
import { AggregateGroupByReducers, AggregateSteps } from 'redis'
import { redis } from '../daos/impl/redis/redis-om.js'
import {
  _log,
  _info,
  _error,
  getSetName,
} from '../utils/logging.js'

const Log = _log.extend('mapkit')
const Info = _info.extend('mapkit')
const Error = _error.extend('mapkit')
const router = new Router()

function sanitize(param) {
  return param
}

router.get('allPiers', '/mapkit/allPiers', async (ctx) => {
  const log = Log.extend('allPiers')
  const info = Info.extend('allPiers')
  const error = Error.extend('allPiers')
  if (ctx.state.isAsyncRequest === true) {
    log('Async query received.')
  }
  info('Getting all piers to be displayed on map as geocoded annotations.')
  let allPiers
  try {
    const idxAllPiers = 'glp:idx:piers:number'
    const queryAllPiers = '*'
    const optsAllPiers = {}
    optsAllPiers.RETURN = ['pierNumber', '$.loc']
    optsAllPiers.SORTBY = { BY: 'pierNumber', DIRECTION: 'ASC' }
    optsAllPiers.LIMIT = { from: 0, size: 1000 }
    log(`ft.search ${idxAllPiers} "*" RETURN 4 pierNumber $.loc AS coords SORTBY pierNumber ASC LIMIT 0 1000`)
    allPiers = await redis.ft.search(idxAllPiers, queryAllPiers, optsAllPiers)
    log(allPiers)
  } catch (e) {
    error('Failed getting all piers from redis.')
    error(e)
    // throw new Error('Failed getting all piers from redis', { cause: e })
    allPiers = { error: 'Failed getting all piers.', total: 0, documents: [] }
  }
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  info(`${csrfTokenCookie},\n${csrfTokenSession}`)
  if (csrfTokenCookie === csrfTokenSession) info('cookie === session')
  if (!(csrfTokenCookie === csrfTokenSession)) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 200
    ctx.body = allPiers
  }
})

router.get('mapkitSwim', '/mapkit/swim', async (ctx) => {
  const log = Log.extend('mapkitSwim')
  const info = Info.extend('mapkitSwim')
  const error = Error.extend('mapkitSwim')
  if (ctx.state.isAsyncRequest === true) {
    log('Async query received.')
  }
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  info(`${csrfTokenCookie},\n${csrfTokenSession}`)
  if (csrfTokenCookie === csrfTokenSession) info('cookie === session')
  if (!(csrfTokenCookie === csrfTokenSession)) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    let result
    const from = 0
    const size = 100
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 200
    try {
      log('FT.SEARCH glp:idx:piers:swim "*" RETURN 13 pier $.loc AS coords $.property.association AS assoc $.property.associationUrl AS url $.owners[*].members[*].f AS name SORTBY pier ASC')
      const idxPierSwim = 'glp:idx:piers:swim'
      const queryPierSwim = '*'
      const optsPierSwim = {}
      optsPierSwim.RETURN = ['pier', '$.loc', 'AS', 'coords', '$.property.association', 'AS', 'assoc', '$.owners[*].members[*].f', 'AS', 'name']
      optsPierSwim.LIMIT = { from, size }
      optsPierSwim.SORTBY = { BY: 'pier', DIRECTION: 'ASC' }
      const piersInSwim = await redis.ft.search(idxPierSwim, queryPierSwim, optsPierSwim)
      log(piersInSwim)
      result = piersInSwim
    } catch (e) {
      error('Failed to get association first pier coordinate data.')
      ctx.status = 500
      result = { error: 'Failed to get association first pier coordinate data.' }
    }
    ctx.body = result
  }
})

router.get('mapkitFood', '/mapkit/food', async (ctx) => {
  const log = Log.extend('mapkitFood')
  const info = Info.extend('mapkitFood')
  const error = Error.extend('mapkitFood')
  if (ctx.state.isAsyncRequest === true) {
    log('Async query received.')
  }
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  info(`${csrfTokenCookie},\n${csrfTokenSession}`)
  if (csrfTokenCookie === csrfTokenSession) info('cookie ===session')
  if (!(csrfTokenCookie === csrfTokenSession)) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    let result
    const from = 0
    const size = 100
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 200
    try {
      log('FT.SEARCH glp:idx:piers:food "*" RETURN 10 pier $.loc AS coords $.property.business AS business $.property.associationUrl AS url SORTBY pier ASC')
      const idxPierFood = 'glp:idx:piers:food'
      const queryPierFood = '*'
      const optsPierFood = {}
      optsPierFood.RETURN = ['pier', '$.loc', 'AS', 'coords', '$.property.business', 'AS', 'business', '$.property.associationUrl', 'AS', 'url']
      optsPierFood.LIMIT = { from, size }
      optsPierFood.SORTBY = { BY: 'pier', DIRECTION: 'ASC' }
      result = await redis.ft.search(idxPierFood, queryPierFood, optsPierFood)
      log(result.results)
    } catch (e) {
      error('Failed to get food pier coordinate data.')
      ctx.status = 500
      result = { error: 'Failed to get food pier coordinate data.' }
    }
    ctx.body = result
  }
})

router.get('mapkitPublicPiers', '/mapkit/public', async (ctx) => {
  const log = Log.extend('mapkitPublic')
  const info = Info.extend('mapkitPublic')
  const error = Error.extend('mapkitPublic')
  if (ctx.state.isAsyncRequest === true) {
    log('Async query received.')
  }
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  info(`${csrfTokenCookie},\n${csrfTokenSession}`)
  if (csrfTokenCookie === csrfTokenSession) info('cookie === session')
  if (!(csrfTokenCookie === csrfTokenSession)) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    let result
    const from = 0
    const size = 100
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 200
    try {
      log('FT.SEARCH glp:idx:piers:public "*" RETURN 13 pier $.loc AS coords $.property.association AS association $.property.business AS business $.owners[*].members[*].f AS name  SORTBY pier ASC')
      const idxPierPublic = 'glp:idx:piers:public'
      const queryPierPublic = '*'
      const optsPierPublic = {}
      optsPierPublic.RETURN = ['pier', '$.loc', 'AS', 'coords', '$.property.association', 'AS', 'association', '$.property.business', 'AS', 'business', '$.owners[*].members[*].f', 'AS', 'name']
      optsPierPublic.LIMIT = { from, size }
      optsPierPublic.SORTBY = { BY: 'pier', DIRECTION: 'ASC' }
      result = await redis.ft.search(idxPierPublic, queryPierPublic, optsPierPublic)
      log(result.results)
    } catch (e) {
      error('Failed to get public pier coordinate data.')
      ctx.status = 500
      result = { error: 'Failed to get public pier coordinate data.' }
    }
    ctx.body = result
  }
})

router.get('mapkitBusinesses', '/mapkit/businesses', async (ctx) => {
  const log = Log.extend('mapkitBusinesses')
  const info = Info.extend('mapkitBusinesses')
  const error = Error.extend('mapkitBusinesses')
  if (ctx.state.isAsyncRequest === true) {
    log('Async query received.')
  }
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  info(`${csrfTokenCookie},\n${csrfTokenSession}`)
  if (csrfTokenCookie === csrfTokenSession) info('cookie === session')
  if (!(csrfTokenCookie === csrfTokenSession)) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    let result
    const from = 0
    const size = 100
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 200
    try {
      log('FT.SEARCH glp:idx:piers:business"*" RETURN 10 pier $.loc AS coords $.property.business AS business $.property.associationUrl AS url SORTBY business ASC')
      const idxPierBusiness = 'glp:idx:piers:business'
      const queryPierBusiness = '*'
      const optsPierBusiness = {}
      optsPierBusiness.RETURN = ['pier', '$.loc', 'AS', 'coords', '$.property.business', 'AS', 'business', '$.property.associationUrl', 'AS', 'url']
      optsPierBusiness.LIMIT = { from, size }
      // optsPierBusiness.SORTBY = { BY: 'pier', DIRECTION: 'ASC' }
      optsPierBusiness.SORTBY = { BY: 'business', DIRECTION: 'ASC' }
      result = await redis.ft.search(idxPierBusiness, queryPierBusiness, optsPierBusiness)
      log(result.results)
    } catch (e) {
      error('Failed to get business pier coordinate data.')
      ctx.status = 500
      result = { error: 'Failed to get business pier coordinate data.' }
    }
    ctx.body = result
  }
})

router.get('mapkitTowns', '/mapkit/towns', async (ctx) => {
  const log = Log.extend('mapkitTowns')
  const info = Info.extend('mapkitTowns')
  const error = Error.extend('mapkitTowns')
  if (ctx.state.isAsyncRequest === true) {
    log('Async query received.')
  }
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  info(`${csrfTokenCookie},\n${csrfTokenSession}`)
  if (csrfTokenCookie === csrfTokenSession) info('cookie === session')
  if (!(csrfTokenCookie === csrfTokenSession)) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    let result
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 200
    try {
      const key = 'glp:geojson:combined_geneva_lake'
      log(`JSON.GET ${key}`)
      result = await redis.json.get(key, '$')
      log(result)
    } catch (e) {
      error('Failed to get town geoJSON coordinate data.')
      ctx.status = 500
      result = { error: 'Failed to get town geoJSON coordinate data.' }
    }
    ctx.body = result
  }
})

router.get('mapkitMarinas', '/mapkit/marinas', async (ctx) => {
  const log = Log.extend('mapkitMarinas')
  const info = Info.extend('mapkitMarinas')
  const error = Error.extend('mapkitMarinas')
  if (ctx.state.isAsyncRequest === true) {
    log('Async query received.')
  }
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  info(`${csrfTokenCookie},\n${csrfTokenSession}`)
  if (csrfTokenCookie === csrfTokenSession) info('cookie === session')
  if (!(csrfTokenCookie === csrfTokenSession)) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    let result
    const from = 0
    const size = 100
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 200
    try {
      log('FT.SEARCH glp:idx:piers:marina "*" RETURN 10 pier $.loc AS coords $.property.business AS business $.property.associationUrl AS url SORTBY pier ASC')
      const idxPierMarina = 'glp:idx:piers:marina'
      const queryPierMarina = '*'
      const optsPierMarina = {}
      optsPierMarina.RETURN = ['pier', '$.loc', 'AS', 'coords', '$.property.business', 'AS', 'business', '$.property.associationUrl', 'AS', 'url']
      optsPierMarina.LIMIT = { from, size }
      optsPierMarina.SORTBY = { BY: 'pier', DIRECTION: 'ASC' }
      result = await redis.ft.search(idxPierMarina, queryPierMarina, optsPierMarina)
      log(result.results)
    } catch (e) {
      error('Failed to get marina pier coordinate data.')
      ctx.status = 500
      result = { error: 'Failed to get marina pier coordinate data.' }
    }
    ctx.body = result
  }
})

router.get('mapkitAssociations', '/mapkit/associations', async (ctx) => {
  const log = Log.extend('mapkitAssociations')
  const info = Info.extend('mapkitAssociations')
  const error = Error.extend('mapkitAssociations')
  if (ctx.state.isAsyncRequest === true) {
    log('Async query received.')
  }
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  info(`${csrfTokenCookie},\n${csrfTokenSession}`)
  if (csrfTokenCookie === csrfTokenSession) info('cookie === session')
  if (!(csrfTokenCookie === csrfTokenSession)) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    let result
    const num = 100
    const offset = 0
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 200
    try {
      log('FT.AGGREGATE glp:idx:piers:association "*" LOAD 3 $.loc AS coords GROUPBY 1 @association REDUCE TOLIST 1 @coords SORTBY 2 @association ASC LIMIT 0 15')
      const optsAggregateAssociation = {
        LOAD: ['$.loc'],
        STEPS: [
          {
            type: AggregateSteps.GROUPBY,
            properties: '@association',
            REDUCE: [{
              type: AggregateGroupByReducers.TOLIST,
              property: '$.loc',
              AS: 'coords',
            }],
          },
          {
            type: AggregateSteps.SORTBY,
            BY: '@association',
            MAX: 1,
          },
          {
            type: AggregateSteps.LIMIT,
            from: offset,
            size: num,
          },
        ],
      }
      result = await redis.ft.aggregate('glp:idx:piers:association', '*', optsAggregateAssociation)
      log(result.total)
      result.results.forEach((a) => {
        if (a.coords && a.coords.length > 1) {
          /* eslint-disable-next-line */
          a.coords = a.coords.slice(0, 1)
        }
      })
      log(result.results)
    } catch (e) {
      error('Failed to get association first pier coordinate data.')
      ctx.status = 500
      result = { error: 'Failed to get association first pier coordinate data.' }
    }
    ctx.body = result
  }
})

router.get('mapkitLocate', '/mapkit/locate/:lon/:lat/:radius/:units', async (ctx) => {
  const log = Log.extend('locate')
  const info = Info.extend('locate')
  const error = Error.extend('locate')
  if (ctx.state.isAsyncRequest === true) {
    log('Async query received.')
  }
  const lon = (/^-?\d{1,3}\.\d{1,16}$/.exec(sanitize(ctx.params.lon)))?.input
  const lat = (/^-?\d{1,3}\.\d{1,16}$/.exec(sanitize(ctx.params.lat)))?.input
  const radius = parseInt(sanitize(ctx.params.radius.slice(0, 3)), 10)
  const units = ['m', 'km', 'mi', 'ft'].find((u) => u === sanitize(ctx.params.units))
  info(`locate piers within ${radius} ${units} of coords: ${lon}, ${lat}`)

  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  info(`${csrfTokenCookie},\n${csrfTokenSession}`)
  if (csrfTokenCookie === csrfTokenSession) info('cookie === session')
  if (!(csrfTokenCookie === csrfTokenSession)) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    let result
    const from = 0
    const size = 100
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 200
    try {
      log(`FT.SEARCH glp:idx:piers:coords "@coords:[${lon} ${lat} ${radius} ${units}]" RETURN 22 pier $.loc AS coords $.owners[*].estateName AS estateName $.owners[*].members[*].f AS firstname $.owners[*].members[*].l AS lastname $.property.business AS business $.property.association AS association $.property.associationUrl AS url SORTBY pier ASC`)
      const idxPierCoords = 'glp:idx:piers:coords'
      const queryPierCoords = `@coords:[${lon} ${lat} ${radius} ${units}]`
      const optsPierCoords = {}
      optsPierCoords.RETURN = ['pier', '$.loc', 'AS', 'coords', '$.owners[*].estateName', 'AS', 'estateName', '$.owners[*].members[*].f', 'AS', 'firstname', '$.owners[*].members[*].l', 'AS', 'lastname', '$.property.business', 'AS', 'business', '$.property.association', 'AS', 'association', '$.property.associationUrl', 'AS', 'url']
      optsPierCoords.LIMIT = { from, size }
      optsPierCoords.SORTBY = { BY: 'pier', DIRECTION: 'ASC' }
      result = await redis.ft.search(idxPierCoords, queryPierCoords, optsPierCoords)
      log(result.total)
      if (result.total > 0) {
        result.documents.forEach((d) => {
          info(d)
        })
      }
    } catch (e) {
      error(`Failed to locate piers within ${radius} ${units} of coords: ${lon}, ${lat}.`)
      ctx.status = 500
      result = { error: `Failed to locate piers within ${radius} ${units} of coords: ${lon}, ${lat}.` }
    }
    ctx.body = result
  }
})

router.get('mapkitTownPiers', '/mapkit/town/:town', async (ctx) => {
  const log = Log.extend('TownPiers')
  const info = Info.extend('TownPiers')
  const error = Error.extend('TownPiers')
  if (ctx.state.isAsyncRequest === true) {
    log('Async query received.')
  }
  const town = getSetName(sanitize(ctx.params.town))
  info(town)
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  info(`${csrfTokenCookie},\n${csrfTokenSession}`)
  if (csrfTokenCookie === csrfTokenSession) info('cookie === session')
  if (!(csrfTokenCookie === csrfTokenSession)) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    let result = {}
    result.total = 0
    result.documents = []
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 200
    let piersInTown
    const key = `glp:piers_by_town:${town}`
    log(`key: ${key}`)
    try {
      piersInTown = await redis.zRange(key, 0, -1)
      info(piersInTown)
      if (piersInTown.length > 0) {
        // piersInTown.forEach(async (p) => {
        /* eslint-disable-next-line */
        for await(const p of piersInTown) {
          const pier = await redis.json.get(`glp:piers:${p}`, '$')
          // info(pier)
          result.documents.push({ id: pier.pier, value: pier })
          result.total += 1
        }
      }
    } catch (e) {
      error(`Failed to get set ${town}'s piers.`)
      ctx.status = 500
      result = { error: `Failed to get set ${town}'s piers.` }
    }
    result.town = town
    // result.piers = piersInTown
    ctx.body = result
  }
})

router.get('mapkitTownGeoJSON', '/mapkit/geojson/:town', async (ctx) => {
  const log = Log.extend('TownGeoJSON')
  const info = Info.extend('TownGeoJSON')
  const error = Error.extend('TownGeoJSON')
  if (ctx.state.isAsyncRequest === true) {
    log('Async query received.')
  }
  const town = getSetName(sanitize(ctx.params.town))
  info(town)
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  info(`${csrfTokenCookie},\n${csrfTokenSession}`)
  if (csrfTokenCookie === csrfTokenSession) info('cookie === session')
  if (!(csrfTokenCookie === csrfTokenSession)) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    let geojson
    let result
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 200
    try {
      geojson = await redis.json.get(`glp:geojson:${town}`, '$')
      info(geojson)
      result = geojson
    } catch (e) {
      error(`Failed to get ${town}'s geojson data.`)
      ctx.status = 500
      result = { error: `Failed to get ${town}'s geojson data.` }
    }
    ctx.body = result
  }
})

router.get('mapkitGetToken', '/mapkit/getToken', async (ctx) => {
  const log = Log.extend('get-token')
  const info = Info.extend('get-token')
  const error = Error.extend('get-token')
  if (ctx.state.isAsyncRequest === true) {
    log('Async query received.')
  }
  const mapKitAccessToken = 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjNGOUY3ODZCQlMifQ.eyJpc3MiOiJXWThSNVBQOE43IiwiaWF0IjoxNjk3NTY2MjE2LCJleHAiOjE3MDAxNjE2NDcsIm9yaWdpbiI6Imh0dHBzOi8vZ2VuZXZhbGFrZXBpZXJzLmNvbSJ9.OzbmzXyHrlI5Zc2jt7gn_ukoPjNgJsIxsNBilJbrTFTdgkhnt8rba6r5JgsS11WsY_7pu6TO-Bf4HZ_kh2Kb3g'
  info(sanitize(mapKitAccessToken))
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  info(`${csrfTokenCookie},\n${csrfTokenSession}`)
  if (csrfTokenCookie === csrfTokenSession) info('cookie === session')
  if (!(csrfTokenCookie === csrfTokenSession)) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 200
    ctx.body = { tokenID: mapKitAccessToken }
  }
})

export { router as mapkit }
