/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/utils/deleteData.js The script to bulk delete keys from redis.
 */
/* eslint-disable import/no-extraneous-dependencies */
import path from 'node:path'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
// import { opendir, readdir, readFile } from 'node:fs/promises'
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
  // .requiredOption('--database <num>', 'Redis database to delete keys from.')
  .requiredOption('--key-prefix <prefix>', 'The app-specific key prefix for Redis to use.')
  .requiredOption('--key-name <name>', 'The key name for Redis to append to the app-specific key prefix.')

program.parse(process.argv)
const options = program.opts()
options.dbPrefix = DB_PREFIX
log(options)

const keyPath = (DB_PREFIX !== options.keyPrefix) ? `${DB_PREFIX}:${options.keyPrefix}:${options.keyName}:*` : `${options.keyPrefix}:${options.keyName}:*`
log(`prefix: ${keyPath}`)

async function del() {
  return new Promise((resolve, reject) => {
    let deletedKeys = 0
    const scanArgs = {
      match: keyPath,
      type: 'ReJSON-RL',
      count: 20,
    }
    log(scanArgs)
    const stream = redis.scanStream(scanArgs)
    stream.on('data', (keys) => {
      log(keys.length)
      if (keys.length > 0) {
        keys.forEach((key) => {
          log(key)
          deletedKeys += 1
        })
      } else {
        log(`no keys found matching ${keyPath}`)
      }
    })
    stream.on('end', () => {
      log(`Deleted ${deletedKeys} from ${keyPath}`)
      resolve()
    })
  })
}
await del()

// try {
//  let deletedKeys = 0
//  const scanArgs = {
//    match: keyPath,
//    type: 'ReJSON-RL',
//    count: 30,
//  }
//  log(scanArgs)
//  const stream = await redis.scanStream(scanArgs)
//  log(stream)
//  stream.on('data', (resultKeys) => {
//    stream.pause()
//    log(resultKeys)
//    resultKeys.forEach((key) => {
//      log(key)
//      deletedKeys += 1
//    })
//    stream.resume()
//  })
//  stream.on('end', () => {
//    log(`Deleted ${deletedKeys} from ${keyPath}`)
//  })
// } catch (e) {
//   error(e)
//   throw new Error(e.message, { cause: e })
// }

// Done deleting the data, exit process.
process.exit()
