/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @summary The script to add new fields to the pier file.
 * @file src/utils/addNewField.js
 */
import path from 'node:path'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
// import { redis } from '../daos/impl/redis/redis-om.js'
import { _log, _info, _error } from './logging.js'

const log = _log.extend('utils:add-new-fields')
const info = _info.extend('utils:add-new-fields')
const error = _error.extend('utils:add-new-fields')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.resolve(`${__dirname}/../..`)
const appEnv = {}
log(`appRoot: ${appRoot}`)
dotenv.config({ path: path.resolve(appRoot, 'config/app.env'), processEnv: appEnv })
const redisEnv = {}
dotenv.config({ path: path.resolve(appRoot, 'config/redis.env'), processEnv: redisEnv })

const program = new Command()
program.name('addNewFields')
  .requiredOption('--data-dir <dir>', 'Directory containing JSON data files to update.', 'test')
  .option('--dry-run', 'Run the script as a dry-run, so no changes are saved.')

program.parse(process.argv)
const options = program.opts()
const DRYRUN = (options?.dryRun) ? options.dryRun : false
log(options)

const dataDir = path.resolve(appRoot, options.dataDir)
info(`dataDir ${dataDir}`)
let subDirs
const failedToSaveFiles = []
const marinaPiers = ['290', '415', '419', '899']
const foodPiers = ['290', '416', '804', '805', '811', '898']
// const publicRestRooms = ['260', '349A', '430', '900']
const publicPiers = [
  '250', '255', '260', '265', '349A', '350', '407',
  '414', '420', '430', '679A', '898', '900', '901',
  '902', '903', '904']
const swimPiers = [
  '16', '30A', '103A', '104', '140A', '149', '191', '219', '232', '236',
  '239', '250', '255', '286', '312', '333', '349A', '350', '360', '361',
  '386', '407', '412', '435', '441', '466', '497', '519A', '525', '529',
  '536', '542', '544', '545', '550A', '580', '616', '628', '672', '777',
  '804', '836', '837', '874', '893', '897', '901', '902',
]
const businesses = [
  '030', '030A', '290', '291', '292', '325', '333', '349', '349A', '350',
  '350A', '351', '360', '361', '361A', '415', '416', '417', '418', '419',
  '427', '439', '440', '804', '805', '811', '836', '837', '897', '898',
  '899', '899A', '900']
try {
  subDirs = (await readdir(dataDir)).sort().filter((x) => /^\d/.test(x))
  log(subDirs)
  let ttlGrand = 0
  let ttlChanged = 0
  const ttlNullIsland = 0
  const ttlCounts = {}
  /* eslint-disable-next-line */
  for await (const d of subDirs) {
    let changed = false
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
      // Add schema version field if it doesn't alredy exist
      if (pierJson.version === undefined) {
        const VERSION = 1
        pierJson.version = VERSION
        info(`Added schema version number field (${VERSION} to pier ${pierJson.pier}`)
        changed = true
      }

      // Normalize loc property to single value string
      // if (pierJson.loc?.longitude) {
      //   if (pierJson.loc.longitude === 0 && pierJson.loc.latitude === 0) {
      //     ttlNullIsland += 1
      //     info(
      //       `Pier ${pierJson.pier} has Null Island coordinates `
      //       + `(ttl null islands: ${ttlNullIsland}).`,
      //     )
      //   }
      //   const tempLoc = `${pierJson.loc.longitude.toString()},`
      //     + `${pierJson.loc.latitude.toString()}`
      //   pierJson.loc = tempLoc
      //   info(`Normalized pier.loc property to: ${pierJson.loc}`)
      //   changed = true
      // }

      // Add pier.property.business: TEXT
      // Add pier.property.isMarina: NUMERIC<0|1>
      // Add pier.property.hasFood:  NUMERIC<0|1>
      if (pierJson.property.business === undefined) {
        if (businesses.includes(pierJson.pier)) {
          pierJson.property.business = pierJson.property.association
          pierJson.property.association = ''
          pierJson.property.isMarina = (marinaPiers.includes(pierJson.pier)) ? 1 : 0
          pierJson.property.hasFood = (foodPiers.includes(pierJson.pier)) ? 1 : 0
        } else {
          pierJson.property.business = ''
          pierJson.property.isMarina = 0
          pierJson.property.hasFood = 0
        }
        changed = true
      }

      // Add pier.public: NUMERIC<0|1>
      if (pierJson?.public === undefined) {
        if (publicPiers.includes(pierJson.pier)) {
          pierJson.public = 1
        } else {
          pierJson.public = 0
        }
        changed = true
      }
      // Add pier.bigSwimPier: NUMERIC<0|1>
      if (pierJson.bigSwimPier === undefined) {
        if (swimPiers.includes(pierJson.pier)) {
          pierJson.bigSwimPier = 1
        } else {
          pierJson.bigSwimPier = 0
        }
        changed = true
      }

      // Make changes to the pier file here
      log(`${d}/${pier}`)

      if (!DRYRUN) {
        if (changed === true) {
          pierJson = JSON.stringify(pierJson, null, 2)
          const refactoredPier = await writeFile(file, pierJson)
          if (refactoredPier === undefined) {
            log(`Successfully refactored ${file}`)
            ttlChanged += 1
            ttlCounter += 1
          } else {
            error(`Failed to save refactored pier ${file}`)
            failedToSaveFiles.push(file)
            break
          }
        }
      }
    }
    ttlCounts[d] += ttlCounter
    ttlGrand += ttlCounter
  }
  log(`Grand Total number of pier files processed: ${ttlGrand}`)
  log('Total pier files: ', ttlCounts)
  log(`Total pier files changed: ${ttlChanged}`)
  log(`Total Null Island pier files changed: ${ttlNullIsland}`)
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
