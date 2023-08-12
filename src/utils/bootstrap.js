/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/utils/bootstrap.js The script to bootstrap Geneva Lake Piers app.
 */

import path from 'node:path'
import { readFile } from 'node:fs/promises'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
// import { migrations } from '@mattduffy/koa-migrations'
import { _log, _error } from './logging.js'
import * as mongoClient from '../daos/impl/mongodb/mongo-client.js'
import * as redis from '../daos/impl/redis/redis-client.js'

const log = _log.extend('index')
const error = _error.extend('index')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.resolve(`${__dirname}/../..`)
dotenv.config({ path: path.resolve(appRoot, 'config/app.env'), debug: true })
// dotenv.config({ path: path.resolve(appRoot, 'config/mongodb.env'), debug: true })
dotenv.config({ path: path.resolve(appRoot, 'config/redis.env'), debug: true })
log(process.env.DOMAIN_NAME)
log(process.env.SITE_NAME)
log(process.env.MONGODB_CLIENT_DN)
log(mongoClient.uri)
log(process.env.REDIS_KEY_PREFIX)
log(process.env.REDIS_SENTINEL_USER)

let pier = await readFile(path.resolve(appRoot, 'data/1_city_of_lake_geneva/pier-001.json'), { encoding: 'utf-8' })
pier = pier.replace(/\n/g, '')
// pier = JSON.parse(pier)
await redis.redis.call('JSON.SET', 'glp:piers:001', '$', pier)
const x = await redis.redis.call('JSON.GET', 'glp:piers:001', '$')
log(x)
redis.redis.quit()
