/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @summary The script to bulk delete keys from redis.
 * @file src/utils/fixZipCodes.js
 */
/* eslint-disable import/no-extraneous-dependencies */
import path from 'node:path'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { redis_single as redis } from '../daos/impl/redis/redis-single.js'
import { _log, _error } from './logging.js'
/* eslint-enable import/no-extraneous-dependencies */

const log = _log.extend('utils:zip-codes')
const error = _error.extend('utils:zip-codes')

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
program.name('fix zip codes')
  .option('--town <town>', 'Name of a single town to run.')
  .option('--dry-run', 'Dry run the zip code fix, don\'t actully change anything.')

program.parse(process.argv)
const options = program.opts()
options.dbPrefix = DB_PREFIX
options.fontana =     '53125'
options.lakeGeneva =  '53147'
options.linn =        '53147'
options.walworth =    '53184'
options.williamsBay = '53191'

log('options:', options)

let keyPath = options?.keyPrefix ?? options.dbPrefix
log(`full keyPath: ${keyPath}:${options?.keyName}`)
log(`redis.options.keyPrefix: ${redis.options.keyPrefix}`)
// process.exit()

const towns = [
  'city_of_lake_geneva',
  'town_of_linn',
  'town_of_walworth',
  'village_of_williams_bay',
  'village_of_fontana-on-geneva_lake',
]

async function town(t) {
  let result
  try {
    let key = `glp:piers_by_town:${t}`
    log('town sorted set key:', key)
    result = await redis.zRange(key, 0, -1)
    // log(result)
  } catch (e) {
    error(e)
    throw e
  }
  return result 
}
let set 
try {
  if (options?.town) {
    set = await town(options.town)
  } else {
    for await (const t of towns) {
      set = await town(t)
    }
  }
  log(set)
} catch (e) {
  error(e)
  // throw new Error(e.message, { cause: e })
  error(e.message)
  log('Try overriding the default redis user/password with ones that can use DEL.')
  log('R_PRIV_USER=<user> R_PRIV_PASSWORD=<psswd> npm run fixZipCodes...')
}

// Done deleting the data, exit process.
process.exit()
