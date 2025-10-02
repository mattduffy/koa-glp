/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @summary The script to perform a one-time refactoring of $.owners[*].members fields.
 * @file src/utils/addPropertyValueFields.js
 */
import path from 'node:path'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { Command } from 'commander'
import { redis_single as redis } from '../daos/impl/redis/redis-single.js'
import { _log, _error } from './logging.js'

const log = _log.extend('utils:add-property-value-fields')
const error = _error.extend('utils:add-property-value-fields')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.resolve(`${__dirname}/../..`)
const appEnv = {}
log(`appRoot: ${appRoot}`)
dotenv.config({
  path: path.resolve(appRoot, 'config/app.env'),
  processEnv: appEnv,
})
const redisEnv = {}
dotenv.config({
  path: path.resolve(appRoot, 'config/redis.env'),
  processEnv: redisEnv,
})
const DB_PREFIX = redisEnv.REDIS_KEY_PREFIX

const program = new Command()
program.name('add PropertyValue Fields')
  .requiredOption('--data-dir <dir>', 'Directory name of JSON files to update', 'test')
  .option('--dry-run', 'Run the script as a dry-run, so no changes are saved.')
  .option('--test-one', 'test run on only the first pier.')

program.parse(process.argv)
const options = program.opts()
options.dbPrefix = DB_PREFIX
const DRYRUN = (options?.dryRun) ? options.dryRun : false
log(options)
let keyPath = `${options?.keyPrefix ?? options.dbPrefix}:piers:`

const dataDir = path.resolve(appRoot, options.dataDir)
log(`dataDir ${dataDir}`)
let subDirs
const failedToSaveFiles = []
try {
  subDirs = (await readdir(dataDir)).sort().filter((x) => /^\d/.test(x))
  log(subDirs)
  let ttlGrand = 0
  const ttlCounts = {}
  for await (const d of subDirs) {
    const pierDir = path.resolve(dataDir, d)
    log(`pier dir: ${pierDir}`)
    const dir = (await readdir(pierDir)).sort()
    let ttlCounter = 0
    ttlCounts[d] = 0
    for await (const pier of dir) {
      const file = path.resolve(dataDir, d, pier)
      let pierJson = await readFile(file, 'utf-8')
      pierJson = pierJson.replace(/\n/g, '')
      pierJson = JSON.parse(pierJson)

      // Get pierJson.pier from redis
      const key = `${keyPath}${pierJson.pier}`
      log(key)
      let pierFromRedis = await redis.json.get(key) 
      const value = {
        value: '',
        source: '',
        link: '',
      }
      // Make changes to the pier file here
      pierFromRedis.property.value = value
      if (!DRYRUN) {
        const saved = await redis.json.set(key, '$', pierFromRedis)
        log('saved', saved)
      } else {
        log('pretending to set pier', key)
      }
      log(`${d}/${pier}`)
      if (!DRYRUN) {
        // pierJson = JSON.stringify(pierJson, null, 2)
        pierFromRedis = JSON.stringify(pierFromRedis, null, 2)
        const refactoredPier = await writeFile(file, pierFromRedis)
        if (refactoredPier === undefined) {
          log(`Successfully refactored ${file}`)
          ttlCounter += 1
        } else {
          error(`Failed to save refactored pier ${file}`)
          failedToSaveFiles.push(file)
          break
        }
      }
      if (options.testOne && ttlCounter === 1) {
        break
      }
    }
    ttlCounts[d] += ttlCounter
    ttlGrand += ttlCounter
    if (options.testOne && ttlCounter === 1) {
      break
    }
  }
  log(`Grand Total number of pier files processed: ${ttlGrand}`)
  log('Total pier files: ', ttlCounts)
  if (failedToSaveFiles.length > 0) {
    error('Failed to save these files afer updates:')
    failedToSaveFiles.forEach((f) => {
      error(f)
    })
  }
} catch (e) {
  error(e)
  throw new Error(e.message, { cause: e })
}

// Done loading the pier data, exit process.
process.exit()
