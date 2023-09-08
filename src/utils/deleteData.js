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
  .requiredOption('--database <dir>', 'Database to delete data from.')
  .requiredOption('--key-prefix <prefix>', 'The app-specific key prefix for Redis to use.')
  .requiredOption('--key-name <name>', 'The key name for Redis to append to the app-specific key prefix.')

program.parse(process.argv)
const options = program.opts()
log(options)

const appPrefix = (options.keyPrefix !== undefined) ? `:${options.keyPrefix}` : ''
const prefix = `${DB_PREFIX}${appPrefix}:${options.keyName}`
log(`appPrefix: ${appPrefix}`)
log(`prefix: ${prefix}`)



// Done deleting the data, exit process.
process.exit()
