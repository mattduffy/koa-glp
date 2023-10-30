/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/utils/creatGeoJsonFiles.js The script to generate GeoJSON shapefiles for each town.
 */
/* eslint-disable import/no-extraneous-dependencies */
import path from 'node:path'
import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { redis } from '../daos/impl/redis/redis-om.js'
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
program.name('createGeoJsonFiles')
  .option('--town <town>', 'Create a GeoJSON shapefile for this town only.')
  .option('--combined', 'Create one GeoJSON shapefile with all towns included.')

program.parse(process.argv)
const options = program.opts()
if (options?.combined === true && options?.town !== undefined) {
  throw new Error('The --combined and --town options do not work together.')
}
log(options)
const TOWNS = [
  'city_of_lake_geneva',
  'town_of_linn',
  'village_of_williams_bay',
  // 'town_of_fontana',
  'village_of_fontana-on-geneva_lake',
  'town_of_walworth',
]
let setTown
if (options?.town === undefined) {
  setTown = 'all'
  log(setTown)
} else {
  const r = new RegExp(`${options.town}`)
  setTown = TOWNS.find((e) => {
    const m = e.match(r)
    return m?.input === e
  })
}

async function saveGeoJsonFile(data, town) {
  const geojsonData = new Uint8Array(Buffer.from(JSON.stringify(data)))
  const file = await writeFile(path.resolve(appRoot, 'data', 'geojson', `${town}.geojson`), geojsonData)
  return file
}

async function generateGeoJSON(s) {
  if (s === null || s === undefined) {
    throw new Error('Missing required town name.')
  }
  const name = s.slice(s.lastIndexOf(':'))
  const geojson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          id: name,
          name: name.replaceAll('-', '_'),
          numberOfPiers: 0,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[]],
        },
      },
    ],
  }
  log(`using redis set ${s}`)
  const piers = await redis.zRange(s, 0, -1)
  const setSize = await redis.zCard(s)
  geojson.features[0].properties.numberOfPiers = setSize
  log(piers, piers.length, setSize)
  let firstPier = null
  let nullIsland = 0
  let x = 0
  if (piers.length > 0) {
    /* eslint-disable-next-line */
    for await (const p of piers) {
      const key = `glp:piers:${p}`
      // log(p, key)
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
      }
    }
    // williams bay correction points
    // [-88.54234, 42.563805]
    // [-88.52719, 42.565257]
    if (/williams/.test(s)) {
      geojson.features[x].geometry.coordinates[0].push([-88.54234, 42.563805])
      geojson.features[x].geometry.coordinates[0].push([-88.52719, 42.565257])
    }
    // walworth correction points
    // [-88.564359,42.561333],
    // [-88.56213,42.562485],
    if (/walworth/.test(s)) {
      geojson.features[x].geometry.coordinates[0].push([-88.564359, 42.561333])
      geojson.features[x].geometry.coordinates[0].push([-88.56213, 42.562485])
    }
    geojson.features[x].geometry.coordinates[0].push(firstPier)
    geojson.features[x].properties.nullIslands = nullIsland
    x += 1
  }
  return geojson
}

try {
  let rSaved
  if (setTown === 'all') {
    const combinedGeoJson = {
      type: 'FeatureCollection',
      features: [
      ],
    }
    /* eslint-disable-next-line */
    for await (const t of TOWNS) {
      const setName = `${DB_PREFIX}:piers_by_town:${t}`
      const geoj = await generateGeoJSON(setName)
      if (options.combined === true) {
        combinedGeoJson.features.push(geoj.features[0])
      }
      await saveGeoJsonFile(geoj, t)
      rSaved = await redis.json.set(`${DB_PREFIX}:geojson:${t}`, '$', geoj)
      console.log(geoj, { depth: null })
    }
    if (options.combined === true) {
      await saveGeoJsonFile(combinedGeoJson, 'combined_geneva_lake')
      rSaved = await redis.json.set(`${DB_PREFIX}:geojson:combined_geneva_lake`, '$', combinedGeoJson)
      console.log(combinedGeoJson, { depth: null })
    }
    log(rSaved)
  } else {
    const setName = `${DB_PREFIX}:piers_by_town:${setTown}`
    const geoj = await generateGeoJSON(setName)
    rSaved = await redis.json.set(`${DB_PREFIX}:geojson:${setTown}`, '$', geoj)
    log(rSaved)
    await saveGeoJsonFile(geoj, setTown)
    console.dir(geoj, { depth: null })
  }
} catch (e) {
  error(e)
  throw new Error(e.message, { cause: e })
}
process.exit()
