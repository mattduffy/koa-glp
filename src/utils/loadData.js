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
// import * as redis from '../daos/impl/redis/redis-client.js'
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
  .option('--key-prefix <prefix>', 'The key prefix for Redis to use to namespace loaded data.', 'loadtest')

program.parse(process.argv)
const options = program.opts()
log(options)

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
      log(pier.name)
      buffer.push(pier.name)
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
