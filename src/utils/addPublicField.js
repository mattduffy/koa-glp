/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/utils/addPublicField.js The script to perform a one-time addition of a 'public' field to the pier file.
 */
import path from 'node:path'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
// import { redis } from '../daos/impl/redis/redis-om.js'
import { _log, _error } from './logging.js'

const log = _log.extend('utils:add-public-field')
const error = _error.extend('utils:add-public-field')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.resolve(`${__dirname}/../..`)
const appEnv = {}
log(`appRoot: ${appRoot}`)
dotenv.config({ path: path.resolve(appRoot, 'config/app.env'), processEnv: appEnv })
const redisEnv = {}
dotenv.config({ path: path.resolve(appRoot, 'config/redis.env'), processEnv: redisEnv })

const program = new Command()
program.name('addHiddenField')
  .requiredOption('--data-dir <dir>', 'Directory containing JSON data files to update.', 'test')
  .option('--dry-run', 'Run the script as a dry-run, so no changes are saved.')

program.parse(process.argv)
const options = program.opts()
const DRYRUN = (options?.dryRun) ? options.dryRun : false
log(options)

const dataDir = path.resolve(appRoot, options.dataDir)
log(`dataDir ${dataDir}`)
let subDirs
const failedToSaveFiles = []
const publicPiers = [
  '250', '255', '260', '265', '349A',
  '350', '407', '414', '420', '430',
  '679A', '898', '900', '901', '902',
  '903', '904',
]
const swimPiers = [
  '16', '30A', '103A', '104', '140A', '149', '191', '219', '232', '236',
  '239', '250', '255', '286', '312', '333', '349A', '350', '360', '361',
  '386', '407', '412', '435', '441', '466', '497', '519A', '525', '529',
  '536', '542', '544', '545', '550A', '580', '616', '628', '672', '777',
  '804', '836', '837', '874', '893', '897', '901', '902',
]
try {
  subDirs = (await readdir(dataDir)).sort().filter((x) => /^\d/.test(x))
  log(subDirs)
  let ttlGrand = 0
  const ttlCounts = {}
  /* eslint-disable-next-line */
  for await (const d of subDirs) {
    const pierDir = path.resolve(dataDir, d)
    log(`pier dir: ${pierDir}`)
    const dir = (await readdir(pierDir)).sort()
    let ttlCounter = 0
    ttlCounts[d] = 0
    /* eslint-disable-next-line */
    for await (const pier of dir) {
      const file = path.resolve(dataDir, d, pier)
      let pierJson = await readFile(file, 'utf-8')
      pierJson = pierJson.replace(/\n/g, '')
      pierJson = JSON.parse(pierJson)

      // Make changes to the pier file here
      // Add pier.public: <boolean>
      // if (pierJson.public === undefined) {
      if (publicPiers.includes(pierJson.pier)) {
        // pierJson.public = true
        pierJson.public = 1
      } else {
        // pierJson.public = false
        pierJson.public = 0
      }
      if (swimPiers.includes(pierJson.pier)) {
        // pierJson.bigSwimPier = true
        pierJson.bigSwimPier = 1
      } else {
        // pierJson.bigSwimPier = false
        pierJson.bigSwimPier = 0
      }

      // Make changes to the pier file here
      log(`${d}/${pier}`)

      if (!DRYRUN) {
        pierJson = JSON.stringify(pierJson, null, 2)
        const refactoredPier = await writeFile(file, pierJson)
        if (refactoredPier === undefined) {
          log(`Successfully refactored ${file}`)
          ttlCounter += 1
        } else {
          error(`Failed to save refactored pier ${file}`)
          failedToSaveFiles.push(file)
          break
        }
      }
    }
    ttlCounts[d] += ttlCounter
    ttlGrand += ttlCounter
  }
  log(`Grand Total number of pier files processed: ${ttlGrand}`)
  log('Total pier files: ', ttlCounts)
  if (failedToSaveFiles.length > 0) {
    error('Failed to save these files afer updates:')
    failedToSaveFiles.forEach((f) => {
      error(f)
    })
  }
  /* eslint-enable no-restricted-syntax */
} catch (e) {
  error(e)
  throw new Error(e.message, { cause: e })
}

// Done loading the pier data, exit process.
process.exit()
