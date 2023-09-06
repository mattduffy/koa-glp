/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/utils/loadData.js The script to load pier data into the database.
 */

import path from 'node:path'
import { opendir, readdir, readFile } from 'node:fs/promises'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import {
  // redis,
  clientOm,
  // Client,
  // EntityId,
  Schema,
  Repository,
} from '../daos/impl/redis/redis-om.js'
// } from '../daos/impl/redis/redis-client.js'
import { _log, _error } from './logging.js'

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
  .requiredOption('--data-dir <dir>', 'Directory containing JSON data files to load.', 'data/')
  .option('--key-prefix <prefix>', 'The app-specific key prefix for Redis to use to namespace loaded data.')
  .requiredOption('--key-name <name>', 'The key name for Redis to append to the app-specific key prefix.')
  .option('--batch-size <size>', 'Number of records to load in Redis pipeline.  Default is 25', 25)

program.parse(process.argv)
const options = program.opts()
log(options)

const appPrefix = (options.keyPrefix !== undefined) ? `:${options.keyPrefix}` : ''
const prefix = `${DB_PREFIX}${appPrefix}:${options.keyName}`
const pierSchema = new Schema(prefix, {
  pier: { type: 'string', path: '$.pier' },
  loc: { type: 'point', path: '$.loc' },
  geohash: { type: 'string', path: '$.geohash' },
  pluscode: { type: 'string', path: '$.pluscode' },
  tel: { type: 'string', path: '$.property.tel' },
  street: { type: 'string', path: '$.property.address.street' },
  city: { type: 'string', path: '$.property.address.city' },
  state: { type: 'string', path: '$.property.address.state' },
  zip: { type: 'string', path: '$.property.address.zip' },
  estateName: { type: 'string', path: '$.owners.estateName' },
  member: { type: 'boolean', path: '$.owners.member' },
  membershipType: { type: 'string', path: '$.owners.membershipType' },
}, {
  dataStructure: 'JSON',
})

const pierRepository = new Repository(pierSchema, clientOm)
// const pier001 = {
//   pier: '001',
//   loc: { longitude: -88.442671, latitude: 42.590727 },
//   // loc: ['-88.442671,42.590727'],
//   geohash: 'dp9473qhbq0',
//   pluscode: 'HHR4+7WW Lake Geneva, Wisconsin',
//   property: {
//     tel: '(123) 456-7890',
//     address: {
//       street: '1224 W Main St',
//       city: 'Lake Geneva',
//       state: 'WI',
//       zip: '53147',
//     },
//   },
//   owners: [
//     {
//       estateName: '',
//       member: true,
//       membershipType: 'Sustaining',
//       members: [
//         {
//           t: '', f: 'Alan', m: '', l: 'Bosworth', s: '',
//         },
//         {
//           t: '', f: 'Kathi', m: '', l: 'Bosworth', s: '',
//         },
//       ],
//     },
//   ],
// }
// const saved = await pierrepository.save(pier001.pier, pier001)
// log(saved)
// process.exit()

const dataDir = path.resolve(appRoot, options.dataDir)
let subDirs
try {
  subDirs = await readdir(dataDir)
  log(subDirs)
  /* eslint-disable no-restricted-syntax */
  let ttlGrand = 0
  let missingLocCounter = 0
  const ttlCounts = {}
  for await (const d of subDirs) {
    const pierDir = path.resolve(dataDir, d)
    log(`pier dir: ${pierDir}`)
    const dir = await opendir(path.resolve(dataDir, d), { withFileTypes: true })
    let ttlCounter = 0
    let pier
    while ((pier = await dir.read()) !== null) {
      // log(path.resolve(dataDir, d, pier.name))
      /* eslint-disable no-await-in-loop */
      let pierJson = await readFile(path.resolve(dataDir, d, pier.name), 'utf-8')
      pierJson = pierJson.replace(/\n/g, '')
      pierJson = JSON.parse(pierJson)
      if (pierJson.loc.lon === '' && pierJson.loc.lat === '' && pierJson.loc.geohash === '') {
        missingLocCounter += 1
      }
      pierJson.geohash = pierJson.loc.geohash
      delete pierJson.loc.geohash
      pierJson.pluscode = pierJson.loc.pluscode
      delete pierJson.loc.pluscode
      log(dataDir, d, pier.name)
      pierJson.loc.longitude = pierJson.loc.lon
      pierJson.loc.latitude = pierJson.loc.lat
      delete pierJson.loc.lon
      delete pierJson.loc.lat
      log('loc: ', pierJson.loc)
      log('geohash: ', pierJson.geohash)
      log('pluscode: ', pierJson.pluscode)
      log()
      ttlCounter += 1
      // if (counter <= options.batchSize) {
    }
    ttlCounts[d] = ttlCounter
    ttlGrand += ttlCounter
  }
  log(`Grand Total number of pier files processed: ${ttlGrand}`)
  log(`Number of piers missing location data: ${missingLocCounter}`)
  log('Total pier files: ', ttlCounts)
  /* eslint-enable no-restricted-syntax */
} catch (e) {
  error(e)
  throw new Error(e.message, { cause: e })
}

// Done loading the pier data, exit process.
process.exit()
