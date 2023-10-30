/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/utils/refactorPiersFiles.js The script to perform a one-time refactoring of the pier data files.
 */
import path from 'node:path'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
// import { redis } from '../daos/impl/redis/redis-om.js'
import { _log, _error } from './logging.js'

const log = _log.extend('utils:refactor-pier-files')
const error = _error.extend('utils:refactor-pier-files')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.resolve(`${__dirname}/../..`)
const appEnv = {}
log(`appRoot: ${appRoot}`)
dotenv.config({ path: path.resolve(appRoot, 'config/app.env'), processEnv: appEnv })
const redisEnv = {}
dotenv.config({ path: path.resolve(appRoot, 'config/redis.env'), processEnv: redisEnv })

const program = new Command()
program.name('refactorPierFiles')
  .requiredOption('--data-dir <dir>', 'Directory containing JSON data files to refactor.', 'test')

program.parse(process.argv)
const options = program.opts()
log(options)

// const pierSchema = new Schema(prefix, {
//   pier: { type: 'string', path: '$.pier' },
//   loc: { type: 'point', path: '$.loc' },
//   geohash: { type: 'string', path: '$.geohash' },
//   pluscode: { type: 'string', path: '$.pluscode' },
//   tel: { type: 'string', path: '$.property.tel' },
//   street: { type: 'string', path: '$.property.address.street' },
//   city: { type: 'string', path: '$.property.address.city' },
//   state: { type: 'string', path: '$.property.address.state' },
//   zip: { type: 'string', path: '$.property.address.zip' },
//   estateName: { type: 'string', path: '$.owners.estateName' },
//   member: { type: 'boolean', path: '$.owners.member' },
//   membershipType: { type: 'string', path: '$.owners.membershipType' },
// }, {
//   dataStructure: 'JSON',
// })

const dataDir = path.resolve(appRoot, options.dataDir)
log(`dataDir ${dataDir}`)
let subDirs
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
      pierJson.owners.forEach((owner, i) => {
        if (owner.member === false) {
          log(`${i}: membership type: ${owner.membershipType}`)
        }
      })
      if (pierJson.loc?.geohash && pierJson.loc?.geohash !== '') {
        pierJson.geohash = pierJson.loc.geohash
        delete pierJson.loc.geohash
      }
      if (pierJson.loc?.pluscode && pierJson.loc?.pluscode !== '') {
        pierJson.pluscode = pierJson.loc.pluscode
        delete pierJson.loc.pluscode
      }
      if (pierJson.loc?.lon && pierJson.loc?.lon !== '') {
        pierJson.loc.longitude = pierJson.loc.lon
        pierJson.loc.latitude = pierJson.loc.lat
        delete pierJson.loc.lon
        delete pierJson.loc.lat
      }
      if (pierJson.owners.length < 1) {
        pierJson.owners.push({
          estateName: '',
          member: false,
          membershipType: 'Residential Non-member',
          members: [],
        })
      }
      if (pierJson.owners[0].members?.length < 1) {
        pierJson.owners[0].members.push({
          t: '',
          f: '',
          m: '',
          l: '',
          s: '',
          hidden: '',
        })
      }
      if ((pierJson.owners[0].members.length === 1) && (pierJson.owners[0].members[0]?.l === undefined)) {
        pierJson.owners[0].members[0] = {
          t: '',
          f: '',
          m: '',
          l: '',
          s: '',
          hidden: '',
        }
      }
      log(`${d}/${pier}`)
      log('loc: ', pierJson.loc)
      log('geohash: ', pierJson.geohash)
      log('pluscode: ', pierJson.pluscode)

      pierJson = JSON.stringify(pierJson, null, 2)
      const refactoredPier = await writeFile(file, pierJson)
      if (refactoredPier === undefined) {
        log(`Successfully refactored ${file}`)
        ttlCounter += 1
      } else {
        error(`Failed to save refactored pier ${file}`)
        break
      }
    }
    ttlCounts[d] += ttlCounter
    ttlGrand += ttlCounter
  }
  log(`Grand Total number of pier files processed: ${ttlGrand}`)
  log('Total pier files: ', ttlCounts)
  /* eslint-enable no-restricted-syntax */
} catch (e) {
  error(e)
  throw new Error(e.message, { cause: e })
}

// Done loading the pier data, exit process.
process.exit()
