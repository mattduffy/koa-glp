/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/utils/deleteData.js The script to bulk delete keys from redis.
 */
/* eslint-disable import/no-extraneous-dependencies */
import path from 'node:path'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { redis } from '../daos/impl/redis/redis-client.js'
import { _log, _error } from './logging.js'
/* eslint-enable import/no-extraneous-dependencies */

const log = _log.extend('utils:load-data')
const error = _error.extend('utils:load-data')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.resolve(`${__dirname}/../..`)
const appEnv = {}
log(`appRoot: ${appRoot}`)
dotenv.config({ path: path.resolve(appRoot, 'config/app.env'), processEnv: appEnv })
const redisEnv = {}
dotenv.config({ path: path.resolve(appRoot, 'config/redis.env'), processEnv: redisEnv })
const DB_PREFIX = redisEnv.REDIS_KEY_PREFIX

const program = new Command()
program.name('loadData')
  .requiredOption('--key-prefix <prefix>', 'The app-specific key prefix for Redis to use.')
  .requiredOption('--key-name <name>', 'The key name for Redis to append to the app-specific key prefix.')
  .requiredOption('--key-type <type>', 'The redis data type of the keys to delete.')
  .option('--key-count <count>', 'The number of keys to return per cursor.', 500)

program.parse(process.argv)
const options = program.opts()
options.dbPrefix = DB_PREFIX
log(options)

const transparentKeyPrefix = redis?.options?.keyPrefix
let keyPath
if (transparentKeyPrefix === null || transparentKeyPrefix === undefined || transparentKeyPrefix === '') {
  keyPath = `${DB_PREFIX}:${options.keyPrefix}:${options.keyName}:*`
} else {
  keyPath = `${transparentKeyPrefix}${options.keyName}:*`
}
log(`prefix: ${keyPath}`)
// log(`redis.optins.keyPrefix: ${redis.options.keyPrefix}`)
// process.exit()

async function del() {
  return new Promise((resolve, reject) => {
    let deletedKeys = 0
    const scanArgs = {
      match: keyPath,
      type: options.keyType,
      count: options.keyCount,
    }
    log(scanArgs)
    const stream = redis.scanStream(scanArgs)
    stream.on('data', async (keys) => {
      log(`Current scan cursor size: ${keys.length}`)
      let result
      if (keys.length > 0) {
        stream.pause()
        const pipeline = redis.pipeline()
        keys.forEach(async (key) => {
          log(`current cursor key: ${key}`)
          // Super sketchy hack to get around ioredis client config with transparent key prefix set.
          // May be super fragile...
          const k = key.split(':').slice(-1)[0]
          pipeline.del(`${options.keyName}:${k}`)
          deletedKeys += 1
        })
        result = await pipeline.exec()
        log(`pipeline result: ${result}`)
        stream.resume()
      } else {
        log(`no keys found matching ${keyPath}`)
      }
    })
    stream.on('end', () => {
      resolve(`Deleted ${deletedKeys} from ${keyPath}`)
    })
    stream.on('error', (e) => {
      reject(e)
    })
  })
}
try {
  const result = await del()
  log(result)
} catch (e) {
  error(e)
  throw new Error(e.message, { cause: e })
}

// Done deleting the data, exit process.
process.exit()
