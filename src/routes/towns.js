/**
 * @summary Koa router for the towns api endpoints.
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/towns.js The router for the towns api endpoints.
 */

import Router from '@koa/router'
import { ulid } from 'ulid'
import { _log, _error } from '../utils/logging.js'

const log = _log.extend('towns')
const error = _error.extend('towns')
const router = new Router()

/*
 * Fill in the body for parameter sanitizing function.
 */
function sanitize(param) {
  return param
}

router.get('piersByTown', '/towns/:town', async (ctx, next) => {
  try {
    await next()
  } catch (e) {
    ctx.throw(500, 'Error', { town: sanitize(ctx.params.town) })
  }
  ctx.body = sanitize(ctx.params.town)
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
