/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/utils/creatGeoJsonFiles.js The script to generate GeoJSON shapefiles for each town.
 */
/* eslint-disable import/no-extraneous-dependencies */
import path from 'node:path'
import {
// opendir,
// readdir,
// readFile,
} from 'node:fs/promises'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import {
  redis,
  // clientOm,
  // Client,
  // EntityId,
  // Schema,
  // Repository,
} from '../daos/impl/redis/redis-om.js'
import { _log, _error } from './logging.js'
/* eslint-enable import/no-extraneous-dependencies */

const log = _log.extend('utils:createGeoJSON')
const error = _error.extend('utils:createGeoJSON')

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
  .option('--town <town>', 'Create a GeoJSON shapefile for this town only.')
  // .requiredOption('--key-name <name>', 'The key name for Redis to append to the app-specific key prefix.')

program.parse(process.argv)
const options = program.opts()
log(options)
log(options?.town)
const TOWNS = [
  'city_of_lake_geneva',
  'town_of_linn',
  'village_of_williams_bay',
  'town_of_fontana',
  'town_of_walworth',
]
let setTown
if (options?.town === undefined) {
  setTown = 'all'
} else {
  const r = new RegExp(`${options.town}`)
  setTown = TOWNS.find((e) => {
    const m = e.match(r)
    return m?.input === e
  })
}
const setName = `${DB_PREFIX}:piers_by_town:${setTown}`
try {
  log(`using redis set ${setName}`)
  const piers = await redis.zRange(setName, 0, -1)
  log(piers)
  const setSize = await redis.zCard(setName)
  log(setSize)
} catch (e) {
  error(e)
  throw new Error(e.message, { cause: e })
}

process.exit()
