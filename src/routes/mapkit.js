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
      log('ft.search glp:idx:piers:swim "*" return 8 pier $.loc as coords $.property.business $.property.association $.property.associationUrl $.owners[*].members[*].f sortby pier asc limit 0 50')
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
      log('ft.aggregate glp:idx:piers:association "*" LOAD 3 $.loc AS coords groupby 1 @association REDUCE TOLIST 1 @coords sortby 2 @association asc limit 0 15')
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
