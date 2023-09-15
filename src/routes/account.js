/**
 * @summary Koa router for the account api endpoints.
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/account.js The router for the account api endpoints.
 */

import path from 'node:path'
import { rename } from 'node:fs/promises'
import Router from '@koa/router'
import { ulid } from 'ulid'
// import { ObjectId } from 'mongodb'
import formidable from 'formidable'
import { _log, _error } from '../utils/logging.js'
/* eslint-disable-next-line no-unused-vars */
import { Users, AdminUser } from '../models/users.js'

const USERS = 'users'
const accountLog = _log.extend('account')
const accountError = _error.extend('account')

const router = new Router()

function isAsyncRequest(req) {
  return (req.get('X-ASYNCREQUEST') === true)
}

/* eslint-disable-next-line no-unused-vars */
function capitalize(word) {
  return word[0].toUpperCase() + word.substring(1).toLowerCase()
}

function sanitize(param) {
  // fill in with some effective input scubbing logic
  return param
}

function sanitizeFilename(filename) {
  // Remove white space characters from filename.
  // Remove non-word characters from filename.
  /* eslint-disable-next-line */
  const cleanName = filename.replace(/[\s!@#\$%&*\(\)](?!(\.\w{1,4}$))/g, '_')
  console.info(`Sanitizing filename ${filename} to ${cleanName}`)
  return cleanName
}

async function hasFlash(ctx, next) {
  const log = accountLog.extend('hasFlash')
  const error = accountError.extend('hasFlash')
  if (ctx.flash) {
    log('ctx.flash is present: %o', ctx.flash)
  } else {
    error('ctx.flash is missing.')
  }
  await next()
}

router.get('accountPasswordGET', '/account/change/password', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-account-change-password')
  const error = accountError.extend('GET-account-change-password')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    log(`View ${ctx.state.sessionUser.username}'s account password.`)
    // const csrfToken = new ObjectId().toString()
    const csrfToken = ulid()
    ctx.session.csrfToken = csrfToken
    ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
    if (isAsyncRequest(ctx.request)) {
      // async request, send back json
      ctx.type = 'application/json; charset=utf-8'
      // ctx.body = ctx.headers
      ctx.body = { nopeeking: true }
    } else {
      // regular http request, send back view
      const locals = {
        csrfToken,
        body: ctx.body,
        sessionUser: ctx.state.sessionUser,
        flash: ctx.flash.edit ?? {},
        isAuthenticated: ctx.state.isAuthenticated,
        title: `${ctx.app.site}: View Account Password`,
      }
      ctx.status = 200
      await ctx.render('account/user-password', locals)
    }
  }
})

router.post('accountPasswordPOST', '/account/change/password', hasFlash, async (ctx) => {
  const log = accountLog.extend('POST-account-change-password')
  const error = accountError.extend('POST-account-change-password')
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
      // log(files)
      resolve()
    })
  })
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    log(`View ${ctx.state.sessionUser.username}'s account password.`)
    // const sessionId = ctx.cookies.get('session')
    const csrfTokenCookie = ctx.cookies.get('csrfToken')
    const csrfTokenSession = ctx.session.csrfToken
    const csrfTokenHidden = ctx.request.body['csrf-token']
    const { currentPassword } = ctx.request.body || ''
    const { newPassword1 } = ctx.request.body || ''
    const { newPassword2 } = ctx.request.body || ''
    if (csrfTokenCookie === csrfTokenSession && csrfTokenSession === csrfTokenHidden) {
      if (currentPassword === '') {
        error('currentPassword is missing.')
        ctx.flash = { edit: { error: 'Missing current password.' } }
        ctx.redirect('/account/change/password')
      } else if (newPassword1 === '' || newPassword2 === '' || newPassword1 !== newPassword2) {
        error('newPasswords are missing or don\'t match.')
        ctx.flash = { edit: { error: 'New passwords must match.' } }
        ctx.redirect('/account/change/password')
      } else {
        try {
          log('Have currentPassword and matching newPasswordn')
          const result = await ctx.state.sessionUser.updatePassword(currentPassword, newPassword1)
          if (result.success) {
            ctx.state.sessionUser = await ctx.state.sessionUser.update()
            ctx.flash = { edit: { message: result.message } }
            ctx.redirect('/account/change/password')
          } else {
            ctx.flash = { edit: { error: 'Couldn\'t update password.' } }
            ctx.redirect('/account/change/password')
          }
        } catch (e) {
          ctx.flash = { edit: { error: e.message } }
          ctx.redirect('/account/change/password')
        }
      }
    } else {
      error('csrf token mismatch')
      delete ctx.session.csrfToken
      ctx.cookies.set('csrfToken')
      ctx.status = 403
      ctx.type = 'application/json'
      ctx.body = { status: 'Error, csrf tokens do not match' }
    }
  }
})

router.get('accountTokens', '/account/tokens', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-account-tokens')
  const error = accountError.extend('GET-account-tokens')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    log(`View ${ctx.state.sessionUser.username}'s account tokens.`)

    if (isAsyncRequest(ctx.request)) {
      // async request, send back json
      ctx.type = 'application/json; charset=utf-8'
      ctx.body = ctx.state.sessionUser.jwts
    } else {
      // regular http request, send back view
      const locals = {
        body: ctx.body,
        view: ctx.flash.view ?? {},
        sessionUser: ctx.state.sessionUser,
        isAuthenticated: ctx.state.isAuthenticated,
        title: `${ctx.app.site}: View Account Tokens`,
      }
      ctx.status = 200
      await ctx.render('account/user-tokens', locals)
    }
  }
})

router.get('accountCreateKeys', '/account/:username/createKeys/:type?', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-account-generateKeys')
  const error = accountError.extend('GET-account-generateKeys')
  let status
  let body
  log(ctx.headers)
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else if (ctx.request.header.csrftoken !== ctx.session.csrfToken) {
    error(`CSR-Token mismatch: header:${ctx.request.header.csrftoken} - session:${ctx.session.csrfToken}`)
    status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    const db = ctx.state.mongodb.client.db()
    const collection = db.collection(USERS)
    const users = new Users(collection, ctx)
    let username = sanitize(ctx.params.username)
    if (username[0] === '@') {
      username = username.slice(1)
    }
    let user = await users.getByUsername(username)
    const createTypes = { signing: false, encrypting: false }
    if (ctx.params.type === 'signing') {
      createTypes.signing = true
      log('Request to generate signing key type')
    } else if (ctx.params.type === 'encrypting') {
      createTypes.encrypting = true
      log('Request to generate encrypting key type')
    } else {
      createTypes.signing = true
      createTypes.encrypting = true
      log('Request to generate both signing and encrypting keypairs.')
    }
    let keys
    try {
      keys = await user.generateKeys(createTypes)
      user = await user.update()
      if (keys.status === 'success') {
        status = 200
        body = {
          status: 'success',
          url: `${ctx.request.origin}/${user.url}/jwks.json`,
          keys: await user.publicKeys(0, 'jwk'),
        }
      } else {
        status = 418
        body = { error: 'I\'m a teapot' }
      }
    } catch (e) {
      error(`Failed to generate key pair for ${ctx.state.sessionUser.username}`)
      error(e)
      status = 500
      body = { error: 'No webcrypto keys were created.' }
    }
    ctx.status = status
    ctx.type = 'application/json; charset=utf-8'
    ctx.body = body
  }
})

router.get('accountPublicKeys', '/account/pubkeys', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-account-publickeys')
  const error = accountError.extend('GET-account-publickeys')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    log(`is this an async api request? ${ctx.state.isAsyncRequest}`)
    if (ctx.state.isAsyncRequest) {
      ctx.status = 200
      ctx.type = 'application/json; charset=utf-8'
      ctx.body = await ctx.state.sessionUser.publicKeys()
    } else {
      // const csrfToken = new ObjectId().toString()
      const csrfToken = ulid()
      ctx.session.csrfToken = csrfToken
      const locals = {
        csrfToken,
        body: ctx.body,
        pageName: 'pubkeys',
        // nonce: ctx.app.nonce,
        // origin: ctx.request.origin,
        // sessionUser: ctx.state.sessionUser,
        view: ctx.flash.view ?? {},
        title: `${ctx.app.site}: View Public Key`,
        isAuthenticated: ctx.state.isAuthenticated,
        jwtAccess: (ctx.state.sessionUser.jwts).token,
      }
      ctx.status = 200
      await ctx.render('account/user-pubkeys', locals)
    }
  }
})

router.get('accountSignData', '/account/sign/:data', hasFlash, async (ctx) => {
  console.log(ctx)
})

router.get('accountVerifyData', '/account/verify/:signature', hasFlash, async (ctx) => {
  console.log(ctx)
})

router.get('accountEncryptData', '/account/encrypt/:plaintext', hasFlash, async (ctx) => {
  console.log(ctx)
})

router.get('accountDecryptData', '/account/decrypt/:ciphertext', hasFlash, async (ctx) => {
  console.log(ctx)
})

router.get('accountView', '/account/view', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-account-view')
  const error = accountError.extend('GET-account-view')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    log(`View ${ctx.state.sessionUser.username}'s account details.`)
    log('flash %O', ctx.flash)
    const locals = {
      sessionUser: ctx.state.sessionUser,
      body: ctx.body,
      edit: ctx.flash.edit ?? {},
      origin: `${ctx.request.origin}`,
      // csrfToken: new ObjectId().toString(),
      csrfToken: ulid(),
      isAuthenticated: ctx.state.isAuthenticated,
      defaultAvatar: `${ctx.request.origin}/i/accounts/avatars/missing.png`,
      defaultHeader: `${ctx.request.origin}/i/accounts/headers/generic.png`,
      title: `${ctx.app.site}: View Account Details`,
    }
    ctx.status = 200
    await ctx.render('account/user-view-details', locals)
  }
})

router.get('accountEdit', '/account/edit', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-account-edit')
  const error = accountError.extend('GET-account-edit')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    log(`Edit ${ctx.state.sessionUser.username}'s account details.`)
    // const csrfToken = new ObjectId().toString()
    const csrfToken = ulid()
    log(ctx.flash)
    const locals = {
      sessionUser: ctx.state.sessionUser,
      body: ctx.body,
      edit: ctx.flash.edit ?? {},
      csrfToken,
      isAuthenticated: ctx.state.isAuthenticated,
      title: `${ctx.app.site}: Edit Account Details`,
    }
    ctx.session.csrfToken = csrfToken
    ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
    ctx.status = 200
    await ctx.render('account/user-edit-details', locals)
  }
})

router.post('accountEditPost', '/account/edit', hasFlash, async (ctx) => {
  const log = accountLog.extend('POST-account-edit')
  const error = accountError.extend('POST-account-edit')
  const form = formidable({
    encoding: 'utf-8',
    uploadDir: ctx.app.uploadsDir,
    keepExtensions: true,
    multipart: true,
  })
  await new Promise((resolve, reject) => {
    form.parse(ctx.req, (err, fields, files) => {
      if (err) {
        error('There was a problem parsing the multipart form data.')
        error(err)
        reject(err)
        return
      }
      log('Multipart form data was successfully parsed.')
      ctx.request.body = fields
      ctx.request.files = files
      // log(fields)
      // log(files)
      resolve()
    })
  })
  // log(ctx.request.body)
  if (!ctx.state?.isAuthenticated) {
    ctx.flash = {
      index: {
        message: null,
        error: 'You need to be logged in to make account changes.',
      },
    }
    error('Tried to edit account without being authenticated.')
    ctx.redirect('/')
  } else {
    // log(`ctx..body: ${ctx.request.body}`)
    // log(`ctx.fields: ${ctx.request.fields}`)
    // const sessionId = ctx.cookies.get('session')
    const csrfTokenCookie = ctx.cookies.get('csrfToken')
    const csrfTokenSession = ctx.session.csrfToken
    const csrfTokenHidden = ctx.request.body['csrf-token']
    if (csrfTokenCookie === csrfTokenSession && csrfTokenSession === csrfTokenHidden) {
      const { firstname } = ctx.request.body
      if (firstname !== '') ctx.state.sessionUser.firstName = firstname
      const { lastname } = ctx.request.body
      if (lastname !== '') ctx.state.sessionUser.lastName = lastname
      const { username } = ctx.request.body
      if (username !== '') {
        if (username !== ctx.state.sessionUser.username) {
          if (ctx.state.sessionUser.isUsernameAvailable(username)) {
            ctx.state.sessionUser.username = username
            ctx.state.sessionUser.url = `@${username}`
            // const { url } = ctx.request.body
            // if (url !== '') {
            //   ctx.state.sessionUser.url = url
            // }
          } else {
            ctx.flash = {
              edit: {
                info: null,
                message: null,
                error: `${username} is not available.`,
              },
            }
            ctx.redirect('/account/edit')
          }
        }
      }
      const { displayname } = ctx.request.body
      if (displayname !== '') ctx.state.sessionUser.displayName = displayname
      const { primaryEmail } = ctx.request.body
      if (primaryEmail !== '') ctx.state.sessionUser.primarEmail = primaryEmail
      const { secondaryEmail } = ctx.request.body
      if (secondaryEmail !== '') ctx.state.sessionUser.secondaryEmail = secondaryEmail
      const { description } = ctx.request.body
      if (description !== '') ctx.state.sessionUser.description = description
      const { isLocked } = ctx.request.body
      // if (isLocked === 'on') ctx.state.sessionUser.locked = true
      if (isLocked === 'on') {
        ctx.state.sessionUser.locked = true
      } else {
        ctx.state.sessionUser.locked = false
      }
      const { isBot } = ctx.request.body
      // if (isBot === 'on') ctx.state.sessionUser.bot = true
      if (isBot === 'on') {
        ctx.state.sessionUser.bot = true
      } else {
        ctx.state.sessionUser.bot = false
      }
      const { isGroup } = ctx.request.body
      // if (isGroup === 'on') ctx.state.sessionUser.group = true
      if (isGroup === 'on') {
        ctx.state.sessionUser.group = true
      } else {
        ctx.state.sessionUser.group = false
      }
      const { isDiscoverable } = ctx.request.body
      // if (isDiscoverable === 'on') ctx.state.sessionUser.discoverable = true
      if (isDiscoverable === 'on') {
        ctx.state.sessionUser.discoverable = true
      } else {
        ctx.state.sessionUser.discoverable = false
      }
      // log('avatar file: %O', ctx.request.files.avatar.size)
      // log('avatar file: %O', ctx.request.files.avatar.filepath)
      if (ctx.state.sessionUser.publicDir === '') {
        // log('users ctx: %O', ctx.state.sessionUser._ctx)
        log(`${ctx.state.sessionUser.username} - no upload directory set yet, setting it now.`)
        ctx.state.sessionUser.publicDir = 'a'
      }
      const { avatar } = ctx.request.files
      if (avatar.size > 0) {
        const avatarOriginalFilenameCleaned = sanitizeFilename(avatar.originalFilename)
        // const avatarSaved = path.resolve(`${ctx.app.dirs.public.dir}/${ctx.state.sessionUser.publicDir}avatar-${avatar.originalFilename}`)
        const avatarSaved = path.resolve(`${ctx.app.dirs.public.dir}/${ctx.state.sessionUser.publicDir}avatar-${avatarOriginalFilenameCleaned}`)
        await rename(avatar.filepath, avatarSaved)
        // ctx.state.sessionUser.avatar = `${ctx.state.sessionUser.publicDir}avatar-${avatar.originalFilename}`
        ctx.state.sessionUser.avatar = `${ctx.state.sessionUser.publicDir}avatar-${avatarOriginalFilenameCleaned}`
      }
      // log('header file: %O', ctx.request.files.header)
      const { header } = ctx.request.files
      if (header.size > 0) {
        const headerOriginalFilenameCleaned = sanitizeFilename(header.originalFilename)
        // const headerSaved = path.resolve(`${ctx.app.dirs.public.dir}/${ctx.state.sessionUser.publicDir}header-${header.originalFilename}`)
        const headerSaved = path.resolve(`${ctx.app.dirs.public.dir}/${ctx.state.sessionUser.publicDir}header-${headerOriginalFilenameCleaned}`)
        await rename(header.filepath, headerSaved)
        // ctx.state.sessionUser.header = `${ctx.state.sessionUser.publicDir}header-${header.originalFilename}`
        ctx.state.sessionUser.header = `${ctx.state.sessionUser.publicDir}header-${headerOriginalFilenameCleaned}`
      }
      try {
        ctx.state.sessionUser = await ctx.state.sessionUser.update()
        delete ctx.session.csrfToken
        ctx.cookies.set('csrfToken')
        ctx.cookies.set('csrfToken.sig')
        ctx.flash = {
          edit: {
            message: 'Account has been updated.',
            error: null,
          },
        }
        ctx.redirect('/account/view')
      } catch (e) {
        error(e)
        ctx.status = 304
        ctx.flash = {
          error: e,
          info: null,
          message: null,
        }
        ctx.redirect('/account/edit')
      }
    } else {
      error('csrf token mismatch')
      ctx.status = 403
      ctx.type = 'application/json'
      ctx.body = { status: 'Error, csrf tokens do not match' }
    }
  }
})

router.get('adminListUsers', '/admin/account/listusers', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-admin-listusers')
  const error = accountError.extend('GET-admin-listuers')
  if (!ctx.state?.isAuthenticated) {
    ctx.flash = {
      index: {
        message: null,
        error: 'You need to be logged in to do that.',
      },
    }
    error('Tried view something without being authenticated.')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    const locals = {}
    try {
      log(`Welcome admin level user: ${ctx.state.sessionUser.username}`)
      const db = ctx.state.mongodb.client.db()
      const collection = db.collection(USERS)
      const users = new Users(collection, ctx)
      const allUsers = await users.getAllUsers()
      // const csrfToken = new ObjectId().toString()
      const csrfToken = ulid()
      ctx.session.csrfToken = csrfToken
      ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
      locals.list = ctx.flash
      locals.jwtAccess = (ctx.state.sessionUser.jwts).token
      locals.csrfToken = csrfToken
      // locals.nonce = ctx.app.nonce
      // locals.origin = ctx.request.origin
      locals.title = `${ctx.state.siteName}: List Users`
      locals.isAuthenticated = ctx.state.isAuthenticated
      allUsers.map((u) => {
        locals[u._id] = u.users
        return undefined
      })
    } catch (e) {
      error('Error trying to retrieve list of all user accounts.')
      ctx.throw('Error trying to retrieve list of all user accounts.')
    }
    await ctx.render('account/admin-listusers', locals)
  }
})

router.get('adminViewUser', '/admin/account/view/:username', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-admin-viewusers')
  const error = accountError.extend('GET-admin-viewusers')
  if (!ctx.state?.isAuthenticated) {
    ctx.flash = {
      index: {
        message: null,
        error: 'You need to be logged in to do that.',
      },
    }
    error('Tried to view something without being authenticated.')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    const locals = {}
    try {
      let displayUser = ctx.params.username
      log(`Admin view of user: ${displayUser}`)
      // const db = ctx.state.mongodb.client.db()
      // const collection = db.collection(USERS)
      // const users = new Users(collection, ctx)
      const users = new Users(ctx.state.mongodb, ctx)
      if (displayUser[0] === '@') {
        displayUser = displayUser.slice(1)
      }
      displayUser = await users.getByUsername(displayUser)
      const csrfToken = ulid()
      ctx.session.csrfToken = csrfToken
      ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
      // locals.nonce = ctx.app.nonce
      locals.csrfToken = csrfToken
      locals.displayUser = displayUser
      locals.view = ctx.flash.view ?? {}
      // locals.origin = ctx.request.origin
      locals.pageName = 'admin_account_view'
      // locals.privateDir = ctx.app.privateDir
      locals.privateDir = ctx.app.dirs.private.dir
      locals.isAuthenticated = ctx.state.isAuthenticated
      locals.jwtAccess = (ctx.state.sessionUser.jwts).token
      locals.title = `${ctx.app.site}: View ${ctx.params.username}`
      locals.defaultAvatar = `${ctx.request.origin}/i/accounts/avatars/missing.png`
      locals.defaultHeader = `${ctx.request.origin}/i/accounts/headers/generic.png`
    } catch (e) {
      error(`Error trying to retrieve ${ctx.params.username}'s account.`)
      error(e)
      ctx.throw(500, `Error trying to retrieve ${ctx.params.username}'s account.`)
    }
    await ctx.render('account/admin-user-view-details', locals)
  }
})

router.get('adminEditUserGet', '/admin/account/edit/:username', hasFlash, async (ctx) => {
  const log = accountLog.extend('GET-admin-editusers')
  const error = accountError.extend('GET-admin-editusers')
  if (!ctx.state?.isAuthenticated) {
    ctx.flash = {
      index: {
        message: null,
        error: 'You need to be logged in to do that.',
      },
    }
    error('Tried to view something without being authenticated.')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    const locals = {}
    try {
      let displayUser = ctx.params.username
      log(`Admin edit of user ${displayUser}`)
      // const db = ctx.state.mongodb.client.db()
      // const collection = db.collection(USERS)
      // const users = new Users(collection, ctx)
      const users = new Users(ctx.state.mongodb, ctx)
      if (displayUser[0] === '@') {
        displayUser = displayUser.slice(1)
      }
      displayUser = await users.getByUsername(displayUser)
      locals.edit = ctx.flash.edit ?? {}
      locals.title = `${ctx.app.site}: Edit ${ctx.params.username}`
      locals.origin = ctx.request.origin
      locals.isAuthenticated = ctx.state.isAuthenticated
      const csrfToken = ulid()
      ctx.session.csrfToken = csrfToken
      ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
      locals.csrfToken = csrfToken
      locals.displayUser = displayUser
    } catch (e) {
      error(`Error trying to retrieve ${ctx.params.username}'s account.`)
      error(e)
      ctx.throw(500, `Error trying to retrieve ${ctx.params.username}'s account.`)
    }
    await ctx.render('account/admin-user-edit-details', locals)
  }
})

router.post('adminEditUserPost', '/admin/account/edit', hasFlash, async (ctx) => {
  const log = accountLog.extend('POST-admin-editusers')
  const error = accountError.extend('POST-admin-editusers')
  if (!ctx.state?.isAuthenticated) {
    ctx.flash = {
      index: {
        info: null,
        message: null,
        error: 'You need to be logged in to do that.',
      },
    }
    error('Tried to edit an account without being authenticated.')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    try {
      const form = formidable({
        encoding: 'utf-8',
        uploadDir: ctx.app.uploadsDir,
        keepExtensions: true,
        multipart: true,
      })
      await new Promise((resolve, reject) => {
        form.parse(ctx.req, (err, fields, files) => {
          if (err) {
            error('There was a problem parsing the multipart form data.')
            error(err)
            reject(err)
            return
          }
          log('Multipart form data was successfully parsed.')
          ctx.request.body = fields
          ctx.request.files = files
          // log(fields)
          // log(files)
          resolve()
        })
      })
      // const sessionId = ctx.cookies.get('session')
      const csrfTokenCookie = ctx.cookies.get('csrfToken')
      const csrfTokenSession = ctx.session.csrfToken
      const csrfTokenHidden = ctx.request.body['csrf-token']
      // const db = ctx.state.mongodb.client.db()
      // const collection = db.collection(USERS)
      // const users = new Users(collection, ctx)
      const users = new Users(ctx.state.mongodb, ctx)
      if (csrfTokenCookie === csrfTokenSession && csrfTokenSession === csrfTokenHidden) {
        const { username } = ctx.request.body
        let displayUser = await users.getByUsername(username)
        if (username !== '') {
          if (username !== displayUser.username) {
            if (displayUser.isUsernameAvailable(username)) {
              displayUser.username = username
            } else {
              ctx.flash = {
                edit: {
                  info: null,
                  message: null,
                  error: `${username} is not available.`,
                },
              }
              ctx.redirect(`/admin/account/edit/@${displayUser.username}`)
            }
          }
        }
        const { firstname } = ctx.request.body
        if (firstname !== '') displayUser.firstName = firstname
        const { lastname } = ctx.request.body
        if (lastname !== '') displayUser.lastName = lastname
        const { displayname } = ctx.request.body
        if (displayname !== '') displayUser.displayName = displayname
        const { primaryEmail } = ctx.request.body
        if (primaryEmail !== '') displayUser.primarEmail = primaryEmail
        const { secondaryEmail } = ctx.request.body
        if (secondaryEmail !== '') displayUser.secondaryEmail = secondaryEmail
        const { description } = ctx.request.body
        if (description !== '') displayUser.description = description
        const { isLocked } = ctx.request.body
        if (isLocked === 'on') {
          displayUser.locked = true
        } else {
          displayUser.locked = false
        }
        const { isBot } = ctx.request.body
        if (isBot === 'on') {
          displayUser.bot = true
        } else {
          displayUser.bot = false
        }
        const { isGroup } = ctx.request.body
        if (isGroup === 'on') {
          displayUser.group = true
        } else {
          displayUser.group = false
        }
        log('avatar file: %O', ctx.request.files.avatar.size)
        log('avatar file: %O', ctx.request.files.avatar.filepath)
        if (displayUser.publicDir === '') {
          // log('users ctx: %O', displayUser._ctx)
          log(`${displayUser.username} - no upload directory set yet, setting it now.`)
          displayUser.publicDir = 'a'
        }
        const { avatar } = ctx.request.files
        if (avatar.size > 0) {
          const avatarOriginalFilenameCleaned = sanitizeFilename(avatar.originalFilename)
          // const avatarSaved = path.resolve(`${ctx.app.dirs.public.dir}/${displayUser.publicDir}avatar-${avatar.originalFilename}`)
          const avatarSaved = path.resolve(`${ctx.app.dirs.public.dir}/${displayUser.publicDir}avatar-${avatarOriginalFilenameCleaned}`)
          await rename(avatar.filepath, avatarSaved)
          // displayUser.avatar = `${displayUser.publicDir}avatar-${avatar.originalFilename}`
          displayUser.avatar = `${displayUser.publicDir}avatar-${avatarOriginalFilenameCleaned}`
        }
        // log('header file: %O', ctx.request.files.header)
        const { header } = ctx.request.files
        if (header.size > 0) {
          const headerOriginalFilenameCleaned = sanitizeFilename(header.originalFilename)
          // const headerSaved = path.resolve(`${ctx.app.dirs.public.dir}/${displayUser.publicDir}header-${header.originalFilename}`)
          const headerSaved = path.resolve(`${ctx.app.dirs.public.dir}/${displayUser.publicDir}header-${headerOriginalFilenameCleaned}`)
          await rename(header.filepath, headerSaved)
          // displayUser.header = `${displayUser.publicDir}header-${header.originalFilename}`
          displayUser.header = `${displayUser.publicDir}header-${headerOriginalFilenameCleaned}`
        }
        const { url } = ctx.request.body
        if (url !== '') displayUser.url = url
        try {
          displayUser = await displayUser.update()
          ctx.flash = {
            view: {
              info: null,
              message: `${username}'s account has been updated.`,
              error: null,
            },
          }
        } catch (e) {
          error(e)
          // ctx.throw(400, 'Failed to update user account.', e)
          ctx.flash = {
            view: {
              info: null,
              error: e,
              message: null,
            },
          }
        }
        delete ctx.session.csrfToken
        ctx.cookies.set('csrfToken')
        ctx.cookies.set('csrfToken.sig')
        ctx.redirect(`/admin/account/view/@${displayUser.username}`)
      } else {
        error('csrf token mismatch')
        ctx.status = 403
        ctx.type = 'application/json'
        ctx.body = { status: 'Error, csrf tokens do not match' }
      }
    } catch (e) {
      error(e)
      ctx.throw(500, 'Failed up update user\'s account.', e)
    }
  }
})

router.delete('deleteUserAccount', '/admin/account/delete/:id', hasFlash, async (ctx) => {
  const log = accountLog.extend('POST-account-delete')
  const error = accountError.extend('POST-account-delete')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    const form = formidable({
      encoding: 'utf-8',
      multipart: true,
    })
    await new Promise((resolve, reject) => {
      form.parse(ctx.req, (err, fields) => {
        if (err) {
          error('There was a problem parsing the multipart form data.')
          error(err)
          reject(err)
          return
        }
        log('Multipart form data was successfully parsed.')
        ctx.request.body = fields
        log(fields)
        resolve()
      })
    })
    //
    // Check that route param :id and form field id values match
    //
    const csrfTokenCookie = ctx.cookies.get('csrfToken')
    const csrfTokenSession = ctx.session.csrfToken
    const { id, csrfTokenForm } = ctx.request.body
    const db = ctx.state.mongodb.client.db()
    const collection = db.collection(USERS)
    const users = new Users(collection, ctx)
    if (csrfTokenCookie === csrfTokenSession && csrfTokenSession === csrfTokenForm) {
      try {
        // let displayUser = await users.getById(id)
        const displayUser = await users.archiveUser(ctx, id)
        if (!displayUser) {
          ctx.flash.delete = {
            // some flash message
          }
          ctx.status = 404
          ctx.type = 'application/json'
          ctx.body = {
            status: 404,
            error: `User id: ${id} not found.`,
            message: null,
          }
        } else {
          ctx.flash.delete = {
            // some flash message
          }
          ctx.status = 200
          ctx.type = 'application/json'
          ctx.body = {
            status: 200,
            error: null,
            message: `User account: @${displayUser?.username} has been deleted.`,
            user: displayUser.username,
            id,
          }
        }
      } catch (e) {
        error(`Error from users.getById(${id})`)
      }
    } else {
      log('CSRF Token mismatch.  No delete made.')
      log(`session token: ${csrfTokenSession}`)
      log(` cookie token: ${csrfTokenCookie}`)
      log(`   form token: ${csrfTokenForm}`)
      ctx.status = 403
      ctx.type = 'application/json'
      ctx.body = {
        status: 403,
        error: 'Error, csrf tokens do not match',
        message: null,
      }
    }
  }
})

export { router as account }
