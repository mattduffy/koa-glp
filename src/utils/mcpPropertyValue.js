/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @summary The script to automate retrieving property values.
 * @file src/utils/mcpPropertyValue.js
 */
/* eslint-disable import/no-extraneous-dependencies */
import path from 'node:path'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { redis_single as redis } from '../daos/impl/redis/redis-single.js'
import { _log, _error } from './logging.js'
/* eslint-enable import/no-extraneous-dependencies */

const log = _log.extend('utils:propertyValue')
const error = _error.extend('utils:propertyValue')

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
program.name('propertyValue')
  .requiredOption('--pier-number <pier>', 'The pier number to find a property value for.')
  .option('--dry-run', 'Dry run the command, don\'t actully change anything.')

program.parse(process.argv)
const options = program.opts()
options.dbPrefix = DB_PREFIX
log('options:', options)

const keyPath = `${options?.keyPrefix ?? options.dbPrefix}:piers:`
log(`full keyPath: ${keyPath}${options.pierNumber}`)
log(`redis.options.keyPrefix: ${redis.options.keyPrefix}`)
// process.exit()

async function pier(number) {
  let _pier
  if (!number) {
    throw new Error('Missing pier number.')
  }
  try {
    _pier = await redis.json.get(number)
    log(pier)
  } catch (e) {
    error(e)
    throw new Error(`Failed retreiving pier ${number}`, { cause: e })
  }
  return _pier
}
try {
  const result = await pier(`${keyPath}${options.pierNumber}`)
  const address = `${result.property.address.street.split(' ').join('-')}-`
    + `${result.property.address.city.split(' ').join('-')}-`
    + `${result.property.address.city.split(' ').join('-')}-`
    + `${result.property.address.zip}`
  log(address)
} catch (e) {
  error(e)
  // throw new Error(e.message, { cause: e })
  error(e.message)
  log('Try overriding the default redis user/password with ones that can use DEL.')
  log('R_PRIV_USER=<user> R_PRIV_PASSWORD=<psswd> npm run mcpPropertyValue...')
}

// Done getting property value data, exit process.
process.exit()
