/**
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/daos/imple/redis/redis-client.js The low-level connection object of redis.
 */

import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Redis } from 'ioredis'
import {
  Repository,
  Entity,
  Schema,
  Client as redisOm,
} from 'redis-om'
import * as Dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(`${__dirname}/../../../..`)
console.log('redis-client.js >>root = ', root)
const showDebug = process.env.NODE_ENV !== 'production'
// Dotenv.config({ path: path.resolve(root, 'config/redis.env'), debug: showDebug })
const redisEnv = {}
Dotenv.config({ path: path.resolve(root, 'config/redis.env'), processEnv: redisEnv, debug: showDebug })

const sentinelPort = redisEnv.SENTINEL_PORT ?? 36379
const redisConnOpts = {
  sentinels: [
    { host: redisEnv.REDIS_SENTINEL_01, port: sentinelPort },
    { host: redisEnv.REDIS_SENTINEL_02, port: sentinelPort },
    { host: redisEnv.REDIS_SENTINEL_03, port: sentinelPort },
  ],
  name: 'myprimary',
  db: redisEnv.REDIS_DB,
  keyPrefix: `${redisEnv.REDIS_KEY_PREFIX}:` ?? 'koa:',
  sentinelUsername: redisEnv.REDIS_SENTINEL_USER,
  sentinelPassword: redisEnv.REDIS_SENTINEL_PASSWORD,
  username: redisEnv.REDIS_USER,
  password: redisEnv.REDIS_PASSWORD,
  connectionName: 'redis-om',
  enableTLSForSentinelMode: true,
  sentinelRetryStrategy: 100,
  tls: {
    ca: await fs.readFile(redisEnv.REDIS_CACERT),
    rejectUnauthorized: false,
    requestCert: true,
  },
  sentinelTLS: {
    ca: await fs.readFile(redisEnv.REDIS_CACERT),
    rejectUnauthorized: false,
    requestCert: true,
  },
  showFriendlyErrorStack: true,
}
console.log(redisConnOpts)
const redis = new Redis(redisConnOpts)
const redisClient = await new redisOm().use(redis)
export {
  redis,
  redisClient as Client,
  Entity,
  Schema,
  Repository,
}
