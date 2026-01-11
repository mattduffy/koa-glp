/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @summary The script to perform a one-time refactoring of $.owners[*].members fields.
 * @file src/utils/addHiddenField.js
 */
import path from 'node:path'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
// import { redis } from '../daos/impl/redis/redis-om.js'
import { _log, _error } from './logging.js'

const log = _log.extend('utils:add-hidden-field')
const error = _error.extend('utils:add-hidden-field')

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
  .requiredOption(
    '--data-dir <dir>',
    'Directory containing JSON data files to update with $.owners[*].members[*].hidden field.',
    'test',
  )
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
      pierJson.owners.forEach((o, i) => {
        log(`Pier ${pierJson.pier} owner ${i} members...`)
        o.members.forEach((m, j) => {
          if (m?.hidden === undefined || m?.hidden === '') {
            pierJson.owners[i].members[j].hidden = 0
          }
        })
      })
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
