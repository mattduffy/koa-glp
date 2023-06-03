/**
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/daos/imple/redis/redis-client.js The low-level connection object of redis.
 */

import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Redis } from 'ioredis'
import { Entity, Schema, Client as redisOm } from 'redis-om'
import * as Dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(`${__dirname}/../../../..`)
console.log('redis-client.js >>root = ', root)
const showDebug = process.env.NODE_ENV !== 'production'
Dotenv.config({ path: path.resolve(root, 'config/redis.env'), debug: showDebug })

const sentinelPort = process.env.SENTINEL_PORT ?? 36379
const redisConnOpts = {
  sentinels: [
    { host: process.env.REDIS_SENTINEL_01, port: sentinelPort },
    { host: process.env.REDIS_SENTINEL_02, port: sentinelPort },
    { host: process.env.REDIS_SENTINEL_03, port: sentinelPort },
  ],
  name: 'myprimary',
  db: process.env.REDIS_DB,
  keyPrefix: `${process.env.REDIS_KEY_PREFIX}:` ?? 'koa:',
  sentinelUsername: process.env.REDIS_SENTINEL_USER,
  sentinelPassword: process.env.REDIS_SENTINEL_PASSWORD,
  username: process.env.REDIS_USER,
  password: process.env.REDIS_PASSWORD,
  connectionName: 'redis-om',
  enableTLSForSentinelMode: true,
  sentinelRetryStrategy: 100,
  tls: {
    ca: await fs.readFile(process.env.REDIS_CACERT),
    rejectUnauthorized: false,
    requestCert: true,
  },
  sentinelTLS: {
    ca: await fs.readFile(process.env.REDIS_CACERT),
    rejectUnauthorized: false,
    requestCert: true,
  },
}
console.log(redisConnOpts)
const redis = new Redis(redisConnOpts)
const redisClient = await new redisOm().use(redis)
export {
  redisClient as Client,
  Entity,
  Schema,
}
