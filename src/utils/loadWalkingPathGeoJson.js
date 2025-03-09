/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/utils/loadWalkingPathGeoJson.js The script to generate GeoJSON lineString for the walking path.
 */
/* eslint-disable import/no-extraneous-dependencies */
import path from 'node:path'
// import { Buffer } from 'node:buffer'
import {
  writeFile,
  readFile,
} from 'node:fs/promises'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { redis } from '../daos/impl/redis/redis-om.js'
import { _log, _error } from './logging.js'
/* eslint-enable import/no-extraneous-dependencies */

const log = _log.extend('utils:loadWalkingPathGeoJSON')
const error = _error.extend('utils:loadWalkingPathGeoJSON')

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
program.name('loadWalkingPathGeoJson')
  .requiredOption('--data-dir <dir>', 'Directory containing JSON data files to load.', 'data/')
  .option('--town <town>', 'Create a GeoJSON shapefile for this town only.')
  .option('--combined', 'Create one GeoJSON shapefile with all towns included.')

program.parse(process.argv)
const options = program.opts()
log(options)

const dataDir = path.resolve(appRoot, options.dataDir)
try {
  const pathJson = await readFile(path.resolve(dataDir, 'geojson', 'genevalake-walking-path.geojson'), 'utf-8')
  log(pathJson)
  const pathParsed = JSON.parse(pathJson)
  log(pathParsed)
  let rSaved = await redis.json.set(`${DB_PREFIX}:geojson:geneva_lake_walking_path`, '$', pathParsed)
  log(rSaved)
} catch (e) {
  error(e)
}

process.exit()
