/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @summary The script to load a single pier's data into redis.
 * @file src/utils/loadPier.js
 */

import path from 'node:path'
import {
  // readdir,
  readFile,
} from 'node:fs/promises'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
// import { redis } from '../daos/impl/redis/redis-om.js'
import { redis_single as redis } from '../daos/impl/redis/redis-single.js'
import { _log, _error } from './logging.js'

const log = _log.extend('utils:load-Pier-log')
const info = _log.extend('utils:load-Pier-INFO')
const error = _error.extend('utils:load-Pier-error')

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
  .requiredOption('--town-dir <dir>', 'Directory containing JSON data files to load.', 'data/v1')
  .requiredOption('--pier-number <num>', 'The pier number to file the data file.')

program.parse(process.argv)
const options = program.opts()

const dataDir = path.resolve(appRoot, 'data/v1/', options.townDir)
try {
  let pierJson = await readFile(path.resolve(dataDir, `pier-${options.pierNumber}.json`), 'utf-8')
  info(pierJson)
  pierJson = pierJson.replace(/\n/g, '')
  pierJson = JSON.parse(pierJson)
  const locationString = `${pierJson.loc.longitude},${pierJson.loc.latitude}`
  pierJson.loc = locationString
  const pierSaved = await redis.json.set(`${DB_PREFIX}:piers:${pierJson.pier}`, '$', pierJson)
  log(`${pierJson.pier} json.set ${pierSaved}`)

  const townKey = `${DB_PREFIX}:piers_by_town:${options.townDir.substr(2)}`
  const result = await redis.zAdd(townKey, [{ score: 0, value: pierJson.pier }])
  log(`${townKey} ${pierJson.pier}, zAdded ${result}`)

  const keyAllPiers = `${DB_PREFIX}:all_piers_in_order`
  log(`${keyAllPiers} ${pierJson.pier}`)
  const allPiersSortedSet = await redis.zAdd(keyAllPiers, [{ score: 0, value: pierJson.pier }])
  log(`${keyAllPiers} ${pierJson.pier}, zAdded ${allPiersSortedSet}`)
} catch (e) {
  error('Failed to open pier file.')
  throw new Error('Failed to open pier file.', { cause: e })
}

process.exit()
