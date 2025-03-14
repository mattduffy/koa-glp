/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/utils/loadWalkingPathGeoJson.js The script to generate GeoJSON lineString for the walking path.
 */
/* eslint-disable import/no-extraneous-dependencies */
import path from 'node:path'
// import { Buffer } from 'node:buffer'
import {
  // writeFile,
  readFile,
} from 'node:fs/promises'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { SchemaFieldTypes } from '@redis/search'
import { redis } from '../daos/impl/redis/redis-om.js'
import { pointDistanceArr } from './Heading.js'
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
let pathJson
let pathParsed
try {
  pathJson = await readFile(path.resolve(dataDir, 'geojson', 'genevalake-walking-path.geojson'), 'utf-8')
  // log(pathJson)
  pathParsed = JSON.parse(pathJson)
  log(pathParsed)

  /* eslint-disable no-param-reassign */
  pathParsed.features[0].geometry.coordinates.forEach((c, i, arr) => {
    if (i === 0) {
      arr[i][2] = 0
      return
    }
    arr[i][2] = pointDistanceArr(c, arr[i - 1], 'feet')
    console.log(arr[i])
  })
  /* eslint-enable no-param-reassign */

  const rSaved = await redis.json.set(`${DB_PREFIX}:geojson:geneva_lake_walking_path`, '$', pathParsed)
  log(rSaved)
} catch (e) {
  error(e)
}

const markers = []
const mile = 5280
let counter = 0
let miles = 0
pathParsed.features[0].geometry.coordinates.forEach((c, i, arr) => {
  counter += c[2]
  console.log(`Math.trunc(${c[2]}) ${Math.trunc(c[2])}, Math.trunc(${counter}) ${Math.trunc(counter)}`)
  if ((miles * mile) + mile < counter) {
    console.log('logging mile', mile)
    miles += 1
    markers.push([i, c, miles])
  }
})
console.log('mile markers', markers)
const transparentKeyPrefix = redis?.options?.keyPrefix
let prefix
if (transparentKeyPrefix === null || transparentKeyPrefix === undefined || transparentKeyPrefix === '') {
  prefix = `${DB_PREFIX}:pois`
} else {
  prefix = 'pois'
}
try {
  const poiTypeIndex = `${DB_PREFIX}:idx:pois:type`
  await redis.ft.create(
    poiTypeIndex,
    {
      '$.type': {
        type: SchemaFieldTypes.TEXT,
        SORTABLE: true,
        AS: 'poiType',
      },
    },
    {
      ON: 'JSON',
      PREFIX: prefix,
    },
  )
} catch (e) {
  console.info(e)
}
try {
  const poiNameIndex = `${DB_PREFIX}:idx:pois:name`
  await redis.ft.create(
    poiNameIndex,
    {
      '$.type': {
        type: SchemaFieldTypes.TEXT,
        SORTABLE: true,
        AS: 'poiName',
      },
    },
    {
      ON: 'JSON',
      PREFIX: prefix,
    },
  )
} catch (e) {
  console.info(e)
}
process.exit()
