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
// import * as mongoClient from '../daos/impl/mongodb/mongo-client.js'
// import { Schema } from 'redis-om'
import {
  redis,
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
dotenv.config({ path: path.resolve(appRoot, 'config/app.env'), processEnv: appEnv, debug: true })
// log(appEnv)
// const mongoEnv = {}
// dotenv.config({ path: path.resolve(appRoot, 'config/mongodb.env'), processEnv: mongoEnv, debug: true })
// log(mongoEnv)

const program = new Command()
program.name('loadData')
  .requiredOption('--data-dir <dir>', 'Directory containing JSON data files to load.', 'data/')
  .option('--batch-size <size>', 'Number of records to load in Redis pipeline.  Default is 25', 25)
  .option('--key-prefix <prefix>', 'The key prefix for Redis to use to namespace loaded data.', 'test:load:')

program.parse(process.argv)
const options = program.opts()
log(options)

// const testSchema = new Schema('test', {
//   pier: { type: 'string' },
//   location: { type: 'point' },
// }, {
//   dataStructure: 'JSON',
// })
// const testRepo = new Repository(testSchema, clientOm)
// const testPier = { pier: '001', location: { longitude: '-88.442671', latitude: '42.590727' } }
// const savedPier = await testRepo.save(testPier)
// log(savedPier)
// process.exit()

const pierSchema = new Schema('glp:test:piers', {
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
const pier001 = {
  pier: '001',
  location: { longitude: -88.442671, latitude: 42.590727 },
  loc: ['-88.442671,42.590727'],
  geohash: 'dp9473qhbq0',
  pluscode: 'HHR4+7WW Lake Geneva, Wisconsin',
  property: {
    tel: '(123) 456-7890',
    address: {
      street: '1224 W Main St',
      city: 'Lake Geneva',
      state: 'WI',
      zip: '53147',
    },
  },
  owners: [
    {
      estateName: '',
      member: true,
      membershipType: 'Sustaining',
      members: [
        { t: '', f: 'Alan', m: '', l: 'Bosworth', s: '' },
        { t: '', f: 'Kathi', m: '', l: 'Bosworth', s: '' },
      ],
    },
  ],
}
const saved = await pierRepository.save(pier001.pier, pier001)
log(saved)
process.exit()

const dataDir = path.resolve(appRoot, options.dataDir)
let subDirs
try {
  subDirs = await readdir(dataDir)
  log(subDirs)
  // subDirs.forEach(async (d, i) => {
  /* eslint-disable no-restricted-syntax */
  let ttlGrand = 0
  const ttlCounts = {}
  for await (const d of subDirs) {
    const pierDir = path.resolve(dataDir, d)
    log(`pier dir: ${pierDir}`)
    const dir = await opendir(path.resolve(dataDir, d), { withFileTypes: true })
    let ttlCounter = 0
    let counter = 0
    let buffer = []
    let pier
    while ((pier = await dir.read()) !== null) {
      log(path.resolve(dataDir, d, pier.name))
      /* eslint-disable no-await-in-loop */
      let pierJson = await readFile(path.resolve(dataDir, d, pier.name), 'utf-8')
      pierJson = pierJson.replace(/\n/g, '')
      pierJson = JSON.parse(pierJson)
      // buffer.push(pier.name)
      buffer.push(pierJson)
      counter += 1
      ttlCounter += 1
      // if (counter <= options.batchSize) {
      if (buffer.length >= options.batchSize) {
        log(`buffer.length ${buffer.length} >= batchSize: ${options.batchSize}`)
        log(buffer)
        log('stuff the buffer into the radis pipeline.')
        buffer = []
        counter = 0
      }
    }
    if (buffer.length > 0) {
      log('process remaining partial batch of pier files.')
      log(buffer)
      buffer = []
    }
    ttlCounts[d] = ttlCounter
    ttlGrand += ttlCounter
  }
  log(`Grand Total number of pier files processed: ${ttlGrand}`)
  log(ttlCounts)
  /* eslint-enable no-restricted-syntax */
} catch (e) {
  error(e)
  throw new Error(e.message, { cause: e })
}

// const ctx = {
//   app: {
//     root: appRoot,
//     dirs: {
//       public: {
//         dir: `${appRoot}/public`,
//       },
//       private: {
//         dir: `${appRoot}/private`,
//       },
//     },
//   },
// }

// log(mongoClient.uri)
// log('[newUser] DB credentials in use: %O', userProps.client.options.credentials)
// log('[newUser] DB name in use: ', userProps.client.options.dbName)

// Done loading the pier data, exit process.
process.exit()
