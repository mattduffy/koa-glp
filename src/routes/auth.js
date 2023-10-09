/**
 * @summary Koa router for the main top-level pages.
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/auth.js The router for authentication related actions.
 */

import Router from '@koa/router'
import formidable from 'formidable'
import { ulid } from 'ulid'
/* eslint-disable-next-line no-unused-vars */
import { ObjectId } from 'mongodb'
import { _log, _error } from '../utils/logging.js'
import { Users } from '../models/users.js'

const authLog = _log.extend('auth')
const authError = _error.extend('auth')
const router = new Router()

router.get('getLogin', '/login', async (ctx, next) => {
  const log = authLog.extend('GET-login')
  const error = authError.extend('GET-login')
  log('logging the user in')
  try {
    await next()
  } catch (e) {
    error(e)
    ctx.throw(500, e)
  }
  ctx.state.sessionUser = ctx.state.sessionUser ?? {}
  if (ctx.state.isAuthenticated) {
    ctx.redirect('/')
  }
  const csrfToken = ulid()
  // const flashMessage = ctx.flash
  const locals = {
    // origin: ctx.request.origin,
    // siteName: ctx.app.site,
    // appName: ctx.app.site.toProperCase(),
    // nonce: ctx.app.nonce,
    body: ctx.body,
    title: `${ctx.app.site}: Login`,
    sessionUser: ctx.state.sessionUser,
    csrfToken,
    login: ctx.flash.login ?? {},
    isAuthenticated: ctx.state.isAuthenticated,
  }
  log('template {locals}: %O', locals)
  ctx.session.csrfToken = locals.csrfToken
  ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
  await ctx.render('login', locals)
})

router.post('postLogin', '/login', async (ctx) => {
  const log = authLog.extend('POST-login')
  const error = authError.extend('POST-login')
  const form = formidable({
    encoding: 'utf-8',
    uploadDir: ctx.app.uploadsDir,
    keepExtensions: true,
    multipart: true,
  })
  await new Promise((resolve, reject) => {
    form.parse(ctx.req, (err, fields, files) => {
      if (err) {
        reject(err)
        return
      }
      ctx.request.body = fields
      ctx.request.files = files
      log(fields)
      resolve()
    })
  })
  // log(ctx.request.body)
  const sessionId = ctx.cookies.get('session')
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  const csrfTokenHidden = ctx.request.body['csrf-token'][0]
  const { username, password } = ctx.request.body
  log(csrfTokenCookie, csrfTokenSession, csrfTokenHidden)
  log(`session status: ${ctx.session.status}`)
  if (csrfTokenCookie === csrfTokenSession && csrfTokenSession === csrfTokenHidden) {
    const db = ctx.state.mongodb.client.db()
    // await next()
    const collection = db.collection('users')
    const users = new Users(collection, ctx)
    const authUser = await users.authenticateAndGetUser(username[0], password[0])
    if (!authUser.user) {
      error(authUser.error)
      ctx.state.isAuthenticated = false
      ctx.flash = {
        login: {
          username,
          info: authUser.info,
          message: authUser.message,
          error: authUser.error,
        },
      }
      ctx.redirect('/login')
    } else if (authUser) {
      log('successful user login')
      authUser.user.sessionId = sessionId
      const loggedInUser = await authUser.user.update()
      ctx.state.sessionUser = loggedInUser
      ctx.state.isAuthenticated = true
      ctx.session.id = loggedInUser.id
      ctx.session.jwts = loggedInUser.jwts
      ctx.session.username = loggedInUser.username
      delete ctx.session.csrfToken
      ctx.cookies.set('csrfToken')
      ctx.cookies.set('csrfToken.sig')
      ctx.flash = {
        index: {
          username: loggedInUser.username,
          message: `Hello ${loggedInUser.firstName}`,
          info: authUser.message,
          error: null,
        },
      }
      ctx.redirect('/')
    }
  } else {
    error('csrf token mismatch')
    ctx.type = 'application/json'
    ctx.body = { status: 'Error, csrf tokens do not match' }
  }
})

router.get('getLogout', '/logout', async (ctx) => {
  const log = authLog.extend('logout')
  // const error = authError.extend('logout')
  if (ctx.state.isAuthenticated) {
    log('logging out')
    ctx.state.sessionUser = null
    ctx.session = null
  }
  ctx.state.isAuthenticated = false
  ctx.cookies.set('csrfToken')
  ctx.cookies.set('csrfToken.sig')
  ctx.redirect('/')
})

export { router as auth }
