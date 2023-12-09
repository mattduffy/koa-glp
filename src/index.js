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
  errors,
  townSetNames,
  flashMessage,
  getSessionUser,
  prepareRequest,
  checkServerJWKs,
  httpMethodOverride,
  tokenAuthMiddleware,
} from './middlewares.js'
import { apiV1 } from './routes/api_v1.js'
// import { activityV1 } from './routes/activity_stream.js'
import { wellKnown } from './routes/wellKnown.js'
import { account as Account } from './routes/account.js'
import { auth as Auth } from './routes/auth.js'
import { edit as Edit } from './routes/edit.js'
import { mapkit as Mapkit } from './routes/mapkit.js'
import { main as Main } from './routes/main.js'
import { app as theApp } from './routes/app.js'
import { users as Users } from './routes/users.js'
import { seo as Seo } from './routes/seo.js'

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
app.securityContact = appEnv.SECURITY_CONTACT
app.securityGpg = appEnv.SECURITY_GPG
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

async function openGraph(ctx, next) {
  const logg = log.extend('OpenGraph-Embed')
  // const err = error.extend('OpenGraph-Embed')
  const ogArray = []
  ogArray.push('<meta property="og:type" content="website">')
  ogArray.push('<meta property="og:site_name" content="Geneva Lake Piers">')
  ogArray.push('<meta property="og:title" content="The Piers of Geneva Lake">')
  ogArray.push(`<meta property="og:url" content="${ctx.request.href}${ctx.request.search}">`)
  ogArray.push(`<meta property="og:image" content="${ctx.request.origin}/i/ogEmbed-450x295.jpg">`)
  ogArray.push('<meta property="og:image:type" content="image/jpeg">')
  ogArray.push('<meta property="og:image:width" content="450">')
  ogArray.push('<meta property="og:image:height" content="295">')
  ogArray.push('<meta property="og:image:alt" content="Arial photo of the municipal piers in The City of Lake Geneva, Wisconsin.">')
  ogArray.push('<meta property="og:description" content="Information and location of all the piers on Genava Lake.">')
  ctx.state.openGraph = ogArray.join('\n')
  logg(ctx.state.openGraph)
  await next()
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
    + `img-src 'self' data: blob: ${ctx.request.origin} *.apple-mapkit.com; `
    + `font-src 'self' ${ctx.request.origin}; `
    + `media-src 'self' data: ${ctx.request.origin}; `
    + 'frame-src \'self\'; '
    + `child-src 'self' blob: ${ctx.request.origin}; `
    + `worker-src 'self' blob: ${ctx.request.origin}; `
    + `manifest-src 'self' blob: ${ctx.request.origin}; `
    + `connect-src 'self' blob: ${ctx.request.origin} https://plus.codes *.apple-mapkit.com *.geo.apple.com https://mw-ci1-mapkitjs.geo.apple.com; `
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
  ctx.state.searchJwtAccess = appEnv.SEARCHJWTACCESS
  ctx.state.searchAccessToken = appEnv.SEARCHACCESSTOKEN
  ctx.state.structuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Geneva Lake Piers',
    url: ctx.request.origin,
  }, null, 2)
  await next()
}

async function logRequest(ctx, next) {
  const logg = log.extend('logRequest')
  const err = error.extend('logRequest')
  try {
    /* eslint-disable-next-line */
    const ignore = ['favicon', 'c/.+\.css']
    /* eslint-disable-next-line */
    function find(x) {
      const re = new RegExp(x)
      return re.test(ctx.path)
    }
    if (ignore.find(find) === undefined) {
      const db = ctx.state.mongodb.client.db(ctx.state.mongodb.dbName)
      const mainLog = db.collection('mainLog')
      const logEntry = {}
      logEntry.remoteIp = ctx.request.ips
      logEntry.date = new Date()
      logEntry.method = ctx.method
      logEntry.url = ctx.request.href
      logEntry.httpVersion = `${ctx.req.httpVersionMajor}.${ctx.req.httpVersionMinor}`
      logEntry.referer = ctx.request.headers?.referer
      logEntry.userAgent = ctx.request.headers['user-agent']
      await mainLog.insertOne(logEntry)
    }
    logg(`Request href:        ${ctx.request.href}`)
    logg(`Request remote ips:  ${ctx.request.ips}`)
    logg(`Request remote ip:   ${ctx.request.ip}`)
    logg('Request headers:     %O', ctx.request.headers)
    logg('Request querystring: %O', ctx.request.query)
    await next()
  } catch (e) {
    err(e)
    ctx.throw(500, 'Rethrown in logRequest middleware.')
  }
}

app.use(isMongo)
app.use(logRequest)
app.use(viewGlobals)
app.use(openGraph)
app.use(errors)
app.use(httpMethodOverride())
app.use(getSessionUser)
app.use(townSetNames)
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
app.use(Mapkit.routes())
app.use(Main.routes())
app.use(Edit.routes())
app.use(Users.routes())
app.use(Account.routes())
app.use(wellKnown.routes())
app.use(Seo.routes())
// app.use(activityV1.routes())
app.use(apiV1.routes())

app.on('error', async (err, ctx) => {
  error('***********************************')
  error(ctx)
  error('\n')
  error(err)
  error('***********************************')
})

app.listen(port)
