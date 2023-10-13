/**
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/session-handler.js The setup and configuration of the koa app session handler.
 */

// import fs from 'node:fs/promises'
import fs from 'node:fs'
import session from 'koa-session'
import redisStore from 'koa-redis'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(`${__dirname}/..`)
const showDebug = process.env.NODE_ENV !== 'production'
const redisEnv = {}
dotenv.config({ path: path.resolve(root, 'config/sessions.env'), processEnv: redisEnv, debug: showDebug })

// console.log('redis_user: ', redisEnv.REDIS_USER)
// console.log('redis_pwd: ', redisEnv.REDIS_PASSWORD)
// console.log('redis prefix: ', redisEnv.REDIS_KEY_PREFIX)
// console.log('cacert: %o', process.env.REDIS_CACERT)

const sentinelPort = redisEnv.SENTINEL_PORT || 36379
const redisConnOpts = {
  sentinels: [
    { host: redisEnv.REDIS_SENTINEL_01, port: sentinelPort },
    { host: redisEnv.REDIS_SENTINEL_02, port: sentinelPort },
    { host: redisEnv.REDIS_SENTINEL_03, port: sentinelPort },
  ],
  name: 'myprimary',
  db: redisEnv.REDIS_DB,
  sentinelUsername: redisEnv.REDIS_SENTINEL_USER,
  sentinelPassword: redisEnv.REDIS_SENTINEL_PASSWORD,
  username: redisEnv.REDIS_USER,
  password: redisEnv.REDIS_PASSWORD,
  connectionName: 'glp-sessions',
  // keyPrefix: 'koasessions:',
  keyPrefix: `${redisEnv.REDIS_KEY_PREFIX}:sessions:` ?? 'koa:sessions:',
  enableTLSForSentinelMode: true,
  sentinelRetryStrategy: 100,
  tls: {
    ca: fs.readFileSync(redisEnv.REDIS_CACERT),
    rejectUnauthorized: false,
    requestCert: true,
  },
  sentinelTLS: {
    ca: fs.readFileSync(redisEnv.REDIS_CACERT),
    rejectUnauthorized: false,
    requestCert: true,
  },
}
const redis = redisStore(redisConnOpts)

const config = {
  key: 'session',
  maxAge: (86400000 * 3),
  autoCommit: true,
  overwrite: true,
  httpOnly: true,
  signed: true,
  rolling: false,
  renew: false,
  secure: false,
  sameSite: true,
  store: redis,
}

export { session, config, redis }
