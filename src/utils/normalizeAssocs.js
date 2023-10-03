/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/utils/addNormalizeAccocs.js The script to perform a one-time normalization to abbreviated versions of Assocciation (assn, Assoc, Ass, etc).
 */
import path from 'node:path'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
// import { redis } from '../daos/impl/redis/redis-om.js'
import { _log, _error } from './logging.js'

const log = _log.extend('utils:normalize-assoc')
const error = _error.extend('utils:normalize-assoc')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.resolve(`${__dirname}/../..`)
const appEnv = {}
log(`appRoot: ${appRoot}`)
dotenv.config({ path: path.resolve(appRoot, 'config/app.env'), processEnv: appEnv })
const redisEnv = {}
dotenv.config({ path: path.resolve(appRoot, 'config/redis.env'), processEnv: redisEnv })

const program = new Command()
program.name('normalizeAssoc')
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
      // Normalize the different variations
      // of the work Association.
      if (pierJson.property.association.length > 0) {
        // Remove any parentheses (...) from Assocation name.
        if (/\(.+\)/.test(pierJson.property.association)) {
          const stripParens = pierJson.property.association.replace(/\(.+\)/, '')
          log(`Stripping (...) ${pierJson.property.association} ==> ${stripParens}`)
          pierJson.property.association = stripParens
        }
        if (/(Assoc\b|Assn.?)/.test(pierJson.property.association)) {
          const paddedString = `${d}/${pier}`.padEnd(60, ' ')
          log(`${paddedString} \tAssociation: ${pierJson.property.association} (length: ${pierJson.property.association.length})`)
          const newAssoc = pierJson.property.association.replace(/(assoc\b|assn.?)/i, 'Association')
          log(`${pierJson.property.association} ==> ${newAssoc}`)
          pierJson.property.association = newAssoc
        }
      }
      // Make changes to the pier file here

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
    log()
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
