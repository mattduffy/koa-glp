/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/index.js The entry point the Geneva Lake Piers app.
 */

import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import * as Koa from 'koa'
import serve from 'koa-static'
import Keygrip from 'keygrip'
import render from '@koa/ejs'
import * as dotenv from 'dotenv'
import { migrations } from '@mattduffy/koa-migrations'
import { _log, _error } from './utils/logging.js'
import * as mongoClient from './daos/impl/mongodb/mongo-client.js'
import { session, config } from './session-handler.js'
import {
  getSessionUser,
  flashMessage,
  prepareRequest,
  tokenAuthMiddleware,
  // errorHandlers,
  errors,
  httpMethodOverride,
  checkServerJWKs,
} from './middlewares.js'
import { apiV1 } from './routes/api_v1.js'
import { activityV1 } from './routes/activity_stream.js'
import { auth as Auth } from './routes/auth.js'
import { main as Main } from './routes/main.js'
import { wellKnown } from './routes/wellKnown.js'
import { users as Users } from './routes/users.js'
import { app as theApp } from './routes/app.js'
import { account as Account } from './routes/account.js'

const log = _log.extend('index')
const error = _error.extend('index')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.resolve(`${__dirname}/..`)
const appEnv = {}
const showDebug = process.env.NODE_ENV !== 'production'
dotenv.config({ path: path.resolve(appRoot, 'config/app.env'), processEnv: appEnv, debug: showDebug })
// dotenv.config({ path: path.resolve(appRoot, 'config/test.env'), debug: showDebug })

console.info('****************************************************')
console.info('*                                                  *')
console.info(`* Starting up: ${appEnv.SITE_NAME}                   *`)
console.info(`*       local: http://${appEnv.HOST}:${appEnv.PORT}           *`)
console.info(`*      public: https://${appEnv.DOMAIN_NAME}         *`)
console.info('****************************************************')

const key1 = appEnv.KEY1
const key2 = appEnv.KEY2
const key3 = appEnv.KEY3
const port = appEnv.PORT ?? 3333

export const app = new Koa.default()
app.keys = new Keygrip([key1, key2, key3])
app.env = appEnv.APP_ENV ?? 'development'
app.site = appEnv.SITE_NAME ?? 'Web site'
app.domain = appEnv.DOMAIN_NAME ?? 'website.com'
app.host = `${appEnv.HOST}:${port}` ?? `127.0.0.1:${port}`
app.origin = app.host
app.appEnv = appEnv

app.proxy = true
app.root = appRoot
app.templateName = 'genevalakepiers'
app.dirs = {
  archive: {
    archive: `${appRoot}/archive`,
  },
  keys: `${appRoot}/keys`,
  public: {
    dir: `${appRoot}/public`,
    accounts: `${appRoot}/public/a`,
    css: `${appRoot}/public/c`,
    images: `${appRoot}/public/i`,
    scripts: `${appRoot}/public/j`,
  },
  private: {
    dir: `${appRoot}/private`,
    uploads: `${appRoot}/uploads`,
    accounts: `${appRoot}/private/a`,
  },
}
appEnv.UPLOADSDIR = app.dirs.private.uploads

const o = {
  db: path.resolve(`${app.root}/src`, 'daos/impl/mongodb/mongo-client.js'),
  db_name: mongoClient.dbname ?? appEnv.MONGODB_DBNAME ?? 'test',
}
app.use(session(config, app))
if (app.env === 'development') {
  app.use(migrations(o, app))
}

render(app, {
  root: `${appRoot}/views/${app.templateName}`,
  layout: 'grid-template',
  viewExt: 'ejs',
  cache: false,
  debug: true,
  delimter: '%',
  async: true,
})

async function proxyCheck(ctx, next) {
  const logg = log.extend('proxyCheck')
  const err = error.extend('proxyCheck')
  if (ctx.request.get('x-nginx-proxy') === 'true') {
    logg('Koa app is running behind an nginx proxy.')
    // log(ctx.headers)
    logg(`Koa app is using ${ctx.protocol}`)
  } else {
    logg('Koa app is NOT running behind an nginx proxy.')
  }
  try {
    await next()
  } catch (e) {
    err(e)
    ctx.throw(500, 'Rethrown in CSP middleware', e)
  }
}

async function csp(ctx, next) {
  const logg = log.extend('CSP')
  const err = error.extend('CSP')
  // nonce assignment moved to the viewGlobals() middleware function.
  // ctx.app.nonce = crypto.randomBytes(16).toString('base64')
  const { nonce } = ctx.state
  const policy = 'base-uri \'none\'; '
    + 'default-src \'self\'; '
    + 'frame-ancestors \'none\'; '
    + 'object-src \'none\'; '
    + 'form-action \'self\'; '
    + `style-src 'self' ${ctx.request.origin} 'unsafe-inline' 'nonce-${nonce}'; `
    + `style-src-attr 'self' ${ctx.request.origin} 'unsafe-inline'; `
    + `style-src-elem 'self' ${ctx.request.origin} 'unsafe-inline'; `
    + `script-src 'self' ${ctx.request.origin} 'nonce-${nonce}'; `
    + `script-src-attr 'self' ${ctx.request.origin} 'nonce-${nonce}'; `
    + `script-src-elem 'self' ${ctx.request.origin} 'nonce-${nonce}'; `
    + `img-src 'self' data: blob: ${ctx.request.origin}; `
    + `font-src 'self' ${ctx.request.origin}; `
    + `media-src 'self' data: ${ctx.request.origin}; `
    + 'frame-src \'self\'; '
    + `child-src 'self' blob: ${ctx.request.origin}; `
    + `worker-src 'self' blob: ${ctx.request.origin}; `
    + `manifest-src 'self' blob: ${ctx.request.origin}; `
    + `connect-src 'self' blob: ${ctx.request.origin} ${ctx.request.origin.replace('https', 'wss')}; `
  ctx.set('Content-Security-Policy', policy)
  logg(`Content-Security-Policy: ${policy}`)
  try {
    await next()
  } catch (e) {
    err(e)
    ctx.throw(500, 'Rethrown in CSP middleware', e)
  }
}

async function cors(ctx, next) {
  const logg = log.extend('CORS')
  const err = error.extend('CORS')
  logg('Cors middleware checking headers.')
  ctx.set('Vary', 'Origin')
  ctx.set('Access-Control-Allow-Origin', ctx.request.origin)
  ctx.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
  ctx.set('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS')
  try {
    await next()
  } catch (e) {
    err(e)
    ctx.throw(500, 'Rethrown in CORS middleware', e)
  }
}

// checking to see if mongodb client is working
async function isMongo(ctx, next) {
  const logg = log.extend('isMongo')
  const err = error.extend('isMongo')
  // const { client, ObjectId } = mongoClient
  // logg(mongoClient.uri)
  ctx.state.mongodb = mongoClient
  try {
    logg(mongoClient.uri)
    // logg(mongoClient.client)
    await next()
  } catch (e) {
    err(e)
    ctx.throw(500, 'Rethrown in mongodb setup.', e)
  }
}

async function viewGlobals(ctx, next) {
  ctx.state.nonce = crypto.randomBytes(16).toString('base64')
  ctx.state.origin = ctx.request.origin
  ctx.state.siteName = ctx.app.site
  ctx.state.appName = ctx.app.site.toProperCase()
  ctx.state.stylesheets = []
  await next()
}

async function logRequest(ctx, next) {
  const logg = log.extend('logRequest')
  const err = error.extend('logRequest')
  try {
    logg(`Request href:       ${ctx.request.href}`)
    logg(`Request remote ips: ${ctx.request.ips}`)
    logg(`Request remote ip:  ${ctx.request.ip}`)
    logg('Request headers:    %O', ctx.request.headers)
    await next()
  } catch (e) {
    err(e)
    ctx.throw(500, 'Rethrown in logRequest middleware.')
  }
}

app.use(logRequest)
app.use(viewGlobals)
app.use(errors)
app.use(httpMethodOverride())
app.use(isMongo)
app.use(getSessionUser)
app.use(flashMessage({}, app))
app.use(prepareRequest())
app.use(tokenAuthMiddleware())
app.use(checkServerJWKs)
app.use(proxyCheck)
app.use(csp)
app.use(cors)
app.use(serve(app.dirs.public.dir))
app.use(theApp.routes())
app.use(Auth.routes())
app.use(Main.routes())
app.use(Users.routes())
app.use(Account.routes())
app.use(wellKnown.routes())
app.use(activityV1.routes())
app.use(apiV1.routes())

app.on('error', async (err, ctx) => {
  error('***********************************')
  error(ctx)
  error('\n')
  error(err)
  error('***********************************')
})

app.listen(port)
