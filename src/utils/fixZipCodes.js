/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @summary The script to bulk delete keys from redis.
 * @file src/utils/fixZipCodes.js
 */
/* eslint-disable import/no-extraneous-dependencies */
import path from 'node:path'
// import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import * as dotenv from 'dotenv'
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
const dataRoot = path.resolve(appRoot, 'data', 'v1')
log(`dataRoot ${dataRoot}`)

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
options.city_of_lake_geneva = {
  zip: '53147',
  name: 'Lake Geneva',
  dir1: {
    key: '039',
    dir: '1_city_of_lake_geneva',
  },
  dir2: {
    key: '836',
    dir: '7_city_of_lake_geneva',
  },
}
options.town_of_linn = {
  zip: '53147',
  name: 'Town of Linn',
  dir1: {
    key: '167',
    dir: '2_town_of_linn',
  },
  dir2: {
    key: '525',
    dir: '6_town_of_linn',
  },
}
options.village_of_williams_bay = {
  zip: '53191',
  name: 'Williams Bay',
  dir: '3_village_of_williams_bay',
}
options.town_of_walworth = {
  zip: '53125',
  name: 'Walworth',
  dir: '4_town_of_walworth',
}
options['village_of_fontana-on-geneva_lake'] = {
  zip: '53125',
  name: 'Fontana',
  dir: '5_village_of_fontana-on-geneva_lake',
}

log('options:', options)

const keyPath = options?.keyPrefix ?? options.dbPrefix
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
    const key = `glp:piers_by_town:${t}`
    log('town sorted set key:', key)
    result = await redis.zRange(key, 0, -1)
    // log(result)
  } catch (e) {
    error(e)
    throw e
  }
  return result
}

async function getPier(pier) {
  let p
  // eslint-disable-next-line
  try {
    const key = `glp:piers:${pier}`
    log('getting pier:', key)
    p = await redis.json.get(key)
  } catch (e) {
    throw e
  }
  return p
}

async function setPier(num, pier) {
  let result
  // eslint-disable-next-line
  try {
    const key = `glp:piers:${num}`
    if (options?.dryRun) {
      log('pretending to set pier', key)
    } else {
      result = await redis.json.set(key, '$', pier)
      log('setting pier: ', key, result)
    }
  } catch (e) {
    throw e
  }
  return result
}

let piers
let numberOfPiers = 0
const needToBeUpdated = []
try {
  if (options?.dryRun) {
    log('DRY RUN!!!!\n')
  }
  if (options?.town) {
    piers = await town(options.town)
    // eslint-disable-next-line
    for await (const pierNumber of piers) {
      const _town = options[options.town]
      const pier = await getPier(pierNumber)
      log(pier.property.address)
      if (pier.property.address.zip !== town.zip) {
        log(`Zip Code needs to be updated! ${pier.property.address.zip} != ${town.zip}`)
        needToBeUpdated.push(pierNumber)
      }
      // const saved = await setPier(pierNumber, pier)
      await setPier(pierNumber, pier)
      // eslint-disable-next-line
      const pierDir = (_town?.dir) ? _town.dir
        : ((Number.parseInt(pierNumber, 10) <= Number.parseInt(_town.dir1.key, 10))
          ? _town.dir1.dir
          : _town.dir2.dir)
      const pierFile = path.resolve(dataRoot, pierDir, `pier-${pierNumber}.json`)
      log('pierFile', pierFile)
      log('\n')
    }
    numberOfPiers = piers.length
    // log(piers)
  } else {
    // eslint-disable-next-line
    for await (const t of towns) {
      piers = await town(t)
      numberOfPiers += piers.length
      log(piers.length)
    }
  }
  log('number of piers:', numberOfPiers)
  if (options?.dryRun) {
    log('DRY RUN!!!!')
    log('Piers that needed to be updated:', needToBeUpdated.join(', '))
  }
} catch (e) {
  error(e)
  // throw new Error(e.message, { cause: e })
  error(e.message)
  log('Try overriding the default redis user/password with ones that can use DEL.')
  log('R_PRIV_USER=<user> R_PRIV_PASSWORD=<psswd> npm run fixZipCodes...')
}

// Done deleting the data, exit process.
process.exit()
