/**
 * @summary Koa router for the towns api endpoints.
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/towns.js The router for the towns api endpoints.
 */

import Router from '@koa/router'
// import { ulid } from 'ulid'
import { redis } from '../daos/impl/redis/redis-om.js'
import {
  _log,
  _error,
  // TOWNS,
  getSetName,
  capitalize,
} from '../utils/logging.js'

const Log = _log.extend('towns')
const Error = _error.extend('towns')
const router = new Router()

function sanitize(param) {
  return param
}

router.get('piersByTown', '/towns/:town', async (ctx) => {
  const log = Log.extend('GET-piersByTown')
  const error = Error.extend('GET-piersByTown')
  const town = getSetName(sanitize(ctx.params.town))
  log(town)
  let piersInTown
  const key = `glp:piers_by_town:${town}`
  log(`key: ${key}`)
  try {
    piersInTown = await redis.zRange(key, 0, -1)
  } catch (e) {
    error(e)
    ctx.throw(500, 'Error', { town })
  }
  // ctx.status = 200
  // ctx.type = 'application/json'
  // ctx.body = { town, piersInTown }
  const locals = {}
  locals.piers = piersInTown
  locals.town = town.split('_').map((e) => capitalize(e)).join(' ')
  locals.flash = ctx.flash.view ?? {}
  locals.title = `${ctx.app.site}: App keys`
  locals.isAuthenticated = ctx.state.isAuthenticated
  await ctx.render('towns/town', locals)
})

// router.get('appKeys', '/admin/app/keys', async (ctx) => {
//   const log = appLog.extend('GET-app-keys')
//   const error = appError.extend('GET-app-keys')
//   if (!ctx.state?.isAuthenticated) {
//     ctx.flash = {
//       index: {
//         message: null,
//         error: 'You need to be logged in to do that.',
//       },
//     }
//     error('Tried view something without being authenticated.')
//     ctx.status = 401
//     ctx.redirect('/')
//   } else {
//     const o = {
//       db: ctx.state.mongodb.client.db(ctx.state.mongodb.client.dbName),
//       keyDir: ctx.app.dirs.keys,
//       siteName: ctx.app.site,
//     }
//     const theApp = new App(o)
//     // const theApp = new App({ db: ctx.state.mongodb.client, keyDir: ctx.app.dirs.keys })
//     const keys = await theApp.keys()
//     log(keys)
//     const csrfToken = ulid()
//     ctx.session.csrfToken = csrfToken
//     ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
//     const locals = {
//       keys,
//       theApp,
//       csrfToken,
//       nonce: ctx.app.nonce,
//       origin: ctx.request.origin,
//       flash: ctx.flash.view ?? {},
//       title: `${ctx.app.site}: App keys`,
//       isAuthenticated: ctx.state.isAuthenticated,
//       jwtAccess: (ctx.state.sessionUser.jwts).token,
//     }
//     await ctx.render('app/server-keys', locals)
//   }
// })

export { router as towns }
