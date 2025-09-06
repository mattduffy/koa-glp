/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @summary The script to bulk delete keys from redis.
 * @file src/utils/deleteData.js
 */
/* eslint-disable import/no-extraneous-dependencies */
import path from 'node:path'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { redis_single as redis } from '../daos/impl/redis/redis-single.js'
import { _log, _error } from './logging.js'
/* eslint-enable import/no-extraneous-dependencies */

const log = _log.extend('utils:delete-data')
const error = _error.extend('utils:delete-data')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.resolve(`${__dirname}/../..`)
const appEnv = {}
log(`appRoot: ${appRoot}`)
dotenv.config({
  path: path.resolve(appRoot, 'config/app.env'),
  processEnv: appEnv,
})
const redisEnv = {}
dotenv.config({
  path: path.resolve(appRoot, 'config/redis.env'),
  processEnv: redisEnv,
})
const DB_PREFIX = redisEnv.REDIS_KEY_PREFIX

const program = new Command()
program.name('deleteData')
  .option('--key-count <count>', 'The number of keys to return per cursor.', 900)
  .requiredOption('--key-prefix <prefix>', 'The app-specific key prefix for Redis to use.')
  .requiredOption('--key-type <type>', 'The redis data type of the keys to delete.')
  .requiredOption('--key-name <name>',
    'The key name for Redis to append to the app-specific key prefix.'
  )

program.parse(process.argv)
const options = program.opts()
options.dbPrefix = DB_PREFIX
log('options:', options)

let keyPath = options?.keyPrefix ?? options.dbPrefix
log(`full keyPath: ${keyPath}:${options.keyName}`)
log(`redis.options.keyPrefix: ${redis.options.keyPrefix}`)
// process.exit()

async function del() {
  const scanArgs = {
    cursor: '0',
    match: `${keyPath}:${options.keyName}`,
    type: options.keyType,
    count: options.keyCount,
  }
  // log(scanArgs)
  // const myIterator = await redis.scanIterator(scanArgs)
  // for await (const keys of myIterator) {
  //   console.log(keys)
  // }
  return await redis.del(`${keyPath}:${options.keyName}`)
  
}
try {
  const result = await del()
  log(`key ${keyPath}:${options.keyName} deleted?`, result)
} catch (e) {
  error(e)
  // throw new Error(e.message, { cause: e })
  console.error(e.message)
  console.info('Try overriding the default redis user/password with ones that can use DEL.')
  console.info('R_DEL_USER=<user> R_DEL_PASSWORD=<psswd> npm run deleteData ...')
}

// Done deleting the data, exit process.
process.exit()
