/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/utils/creatGeoJsonFiles.js The script to generate GeoJSON shapefiles for each town.
 */
/* eslint-disable import/no-extraneous-dependencies */
import path from 'node:path'
import { Buffer } from 'node:buffer'
import {
// opendir,
// readdir,
// readFile,
  writeFile,
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
const geojson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        id: setTown,
        name: setTown,
        numberOfPiers: 0,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[]],
      },
    },
  ],
}
let piers
let firstPier = null
let nullIsland = 0
console.log('%o', geojson)
try {
  let x = 0
  log(`using redis set ${setName}`)
  piers = await redis.zRange(setName, 0, -1)
  const setSize = await redis.zCard(setName)
  geojson.features[0].properties.numberOfPiers = setSize
  log(piers, piers.length, setSize)
  if (piers.length > 0) {
    /* eslint-disable-next-line */
    for await (const p of piers) {
      const key = `glp:piers:${p}`
      // log(i, p, key)
      const pier = await redis.json.get(key)
      const loc = pier.loc.split(',')
      loc[0] = parseFloat(loc[0])
      loc[1] = parseFloat(loc[1])
      if (firstPier === null) {
        firstPier = loc
      }
      if (loc[0] === 0 || loc[1] === 0) {
        nullIsland += 1
      } else {
        geojson.features[x].geometry.coordinates[0].push(loc)
        // log(pier.pier, loc)
        // log(pier)
      }
    }
    geojson.features[x].geometry.coordinates[0].push(firstPier)
    const geojsonData = new Uint8Array(Buffer.from(JSON.stringify(geojson)))
    const geoJsonFile = await writeFile(path.resolve(appRoot, 'data', 'geojson', `${setTown}.geojson`), geojsonData)
    log(geoJsonFile)
  }
  x += 1
  console.dir(geojson, { depth: null })
  log(`Piers without a location: ${nullIsland}`)
} catch (e) {
  error(e)
  throw new Error(e.message, { cause: e })
}
process.exit()
