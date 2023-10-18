/**
 * @summary Koa router for the apple mapkit api endpoints.
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/mapkit.js The router for the apple mapkit api endpoints.
 */

import Router from '@koa/router'
// import { ulid } from 'ulid'
import { redis } from '../daos/impl/redis/redis-om.js'
import {
  _log,
  _info,
  _error,
} from '../utils/logging.js'

const Log = _log.extend('mapkit')
const Info = _info.extend('mapkit')
const Error = _error.extend('mapkit')
const router = new Router()

function sanitize(param) {
  return param
}

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
