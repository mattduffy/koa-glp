/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/utils/bootstrap.js The script to bootstrap the app.
 */

import path from 'node:path'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import * as Users from '@mattduffy/users/Users.js'
import * as mongoClient from '../daos/impl/mongodb/mongo-client.js'
// import * as redis from '../daos/impl/redis/redis-client.js'
import { App } from '../models/app.js'
// import { Users } from '../models/users.js'
import { _log, _error } from './logging.js'

const log = _log.extend('index')
const error = _error.extend('index')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.resolve(`${__dirname}/../..`)
const appEnv = {}
dotenv.config({ path: path.resolve(appRoot, 'config/app.env'), debug: true })
// log(appEnv)
const mongoEnv = {}
dotenv.config({ path: path.resolve(appRoot, 'config/mongodb.env'), processEnv: mongoEnv, debug: true })
// log(mongoEnv)

// const redisEnv = {}
// dotenv.config({ path: path.resolve(appRoot, 'config/redis.env'), processEnv: redisEnv, debug: true })
// log(process.env.REDIS_KEY_PREFIX)
// log(process.env.REDIS_SENTINEL_USER)
// let pier = await readFile(path.resolve(appRoot, 'data/1_city_of_lake_geneva/pier-001.json'), { encoding: 'utf-8' })
// pier = pier.replace(/\n/g, '')
// // pier = JSON.parse(pier)
// await redis.redis.call('JSON.SET', 'glp:piers:001', '$', pier)
// const x = await redis.redis.call('JSON.GET', 'glp:piers:001', '$')
// log(x)
// redis.redis.quit()

// Bootstrap the app collection in the db.
log(mongoClient.uri)
const config = {
  keyDir: `${appRoot}/keys`,
  db: mongoClient.client,
}
const app = new App(config)
try {
  await app.init()
} catch (e) {
  error('Failed to bootstrap the app db collection.')
  error(e)
  throw new Error('App.init() failed.', { cause: e })
}
try {
  const keys = await app.keys()
  log(keys)
} catch (e) {
  error('Failed to crete the app keys.')
  throw new Error('App.keys() failed.', { cause: e })
}

// Bootstrap an admin user account.
const adminProps = {
  first: 'Matt',
  last: 'The Admin',
  emails: [{ primary: 'matt@genevalakepiers.com', verified: false }],
  description: 'The first user account created.',
  username: 'matttheadmin',
  password: appEnv.TEST_PASSWORD,
  jwts: { token: '', refresh: '' },
  client: mongoClient.client,
  dbName: mongoEnv.MONGODB_DBNAME,
  userStatus: 'active',
  schemaVer: 0,
}
const firstUser = Users.newAdminUser(adminProps)
const savedFirstUser = await firstUser.save()
log(savedFirstUser)

// Bootstrapping done, exit process.
process.exit()
