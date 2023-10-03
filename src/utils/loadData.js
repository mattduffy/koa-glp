/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/utils/loadData.js The script to load pier data into redis.
 */
/* eslint-disable import/no-extraneous-dependencies */
import path from 'node:path'
import {
  readdir,
  readFile,
} from 'node:fs/promises'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { SchemaFieldTypes } from '@redis/search'
import {
  redis,
  clientOm,
  Schema,
  Repository,
} from '../daos/impl/redis/redis-om.js'
import { _log, _error } from './logging.js'
/* eslint-enable import/no-extraneous-dependencies */

const log = _log.extend('utils:load-data-log')
const info = _log.extend('utils:load-data-INFO')
const error = _error.extend('utils:load-data-error')

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
  .option('--dry-run', 'Run the load process, but DO NOT insert or SAVE any data.')
  .option('--save-files', 'Saves updated Pier files if used with --dry-run.')

program.parse(process.argv)
const options = program.opts()
const DRYRUN = (options?.dryRun) ? options.dryRun : false
const SAVEFILES = (DRYRUN) ? options?.saveFiles : true
log(options)
log(DRYRUN)
log(SAVEFILES)
// process.exit()
// log(clientOm)

const transparentKeyPrefix = redis?.options?.keyPrefix
let prefix
if (transparentKeyPrefix === null || transparentKeyPrefix === undefined || transparentKeyPrefix === '') {
  prefix = `${DB_PREFIX}:${options.keyName}`
} else {
  prefix = `${options.keyName}`
}

log(`prefix: ${prefix}`)
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

// create the indexes for pier data
const pierNumberIndex = `${DB_PREFIX}:idx:piers:number`
if (!DRYRUN) { // BEGIN DRYRUN CHECK
  try {
    // log(await redis.ft.dropIndex(pierNumberIndex))
    log(`pierNumberIndex name: ${pierNumberIndex}`)
    await redis.ft.create(
      pierNumberIndex,
      {
        '$.pier': {
          type: SchemaFieldTypes.TEXT,
          SORTABLE: true,
          AS: 'pierNumber',
        },
      },
      {
        ON: 'JSON',
        PREFIX: prefix,
      },
    )
  } catch (e) {
    if (e.message === 'Index already exists') {
      log(`${pierNumberIndex} ${e.message}.  Skipping ahead.`)
    } else {
      error(e)
      throw new Error(e.message, { cause: e })
    }
  }
  // create an index for association name
  const pierOwnerAssociationIndex = `${DB_PREFIX}:idx:piers:association`
  try {
    // log(await redis.ft.dropIndex(pierOwnerEstatenameIndex))
    log(`pierOwnerAssociationIndex name: ${pierOwnerAssociationIndex}`)
    await redis.ft.create(
      pierOwnerAssociationIndex,
      {
        '$.pier': {
          type: SchemaFieldTypes.TEXT,
          SORTABLE: true,
          AS: 'pier',
        },
        '$.property.association': {
          type: SchemaFieldTypes.TEXT,
          SORTABLE: true,
          AS: 'association',
        },
      },
      {
        ON: 'JSON',
        PREFIX: prefix,
        FILTER: "@association!=''",
      },
    )
  } catch (e) {
    if (e.message === 'Index already exists') {
      log(`${pierOwnerAssociationIndex} ${e.message}.  Skipping ahead.`)
    } else {
      error(e)
      throw new Error(e.message, { cause: e })
    }
  }

  // create an index for estateName
  const pierOwnerEstatenameIndex = `${DB_PREFIX}:idx:piers:estateName`
  try {
    // log(await redis.ft.dropIndex(pierOwnerEstatenameIndex))
    log(`pierOwnerEstatenameIndex name: ${pierOwnerEstatenameIndex}`)
    await redis.ft.create(
      pierOwnerEstatenameIndex,
      {
        '$.pier': {
          type: SchemaFieldTypes.TEXT,
          SORTABLE: true,
          AS: 'pier',
        },
        '$.owners[*].estateName': {
          type: SchemaFieldTypes.TEXT,
          SORTABLE: true,
          AS: 'estateName',
        },
      },
      {
        ON: 'JSON',
        PREFIX: prefix,
      },
    )
  } catch (e) {
    if (e.message === 'Index already exists') {
      log(`${pierOwnerEstatenameIndex} ${e.message}.  Skipping ahead.`)
    } else {
      error(e)
      throw new Error(e.message, { cause: e })
    }
  }

  // create an index for owner's firstname and lastname
  const pierOwnerNamesIndex = `${DB_PREFIX}:idx:piers:ownerNames`
  try {
    // log(await redis.ft.dropIndex(pierOwnerNamesIndex))
    log(`pierOwnerNamesIndex name: ${pierOwnerNamesIndex}`)
    await redis.ft.create(
      pierOwnerNamesIndex,
      {
        '$.pier': {
          type: SchemaFieldTypes.TEXT,
          SORTABLE: true,
          AS: 'pier',
        },
        '$.owners[*].members[*].f': {
          type: SchemaFieldTypes.TEXT,
          SORTABLE: true,
          AS: 'firstname',
        },
        '$.owners[*].members[*].l': {
          type: SchemaFieldTypes.TEXT,
          SORTABLE: true,
          AS: 'lastname',
        },
        '$.owners[*].members[*].hidden': {
          type: SchemaFieldTypes.NUMERIC,
          SORTABLE: true,
          AS: 'hidden',
        },
      },
      {
        ON: 'JSON',
        PREFIX: prefix,
        FILTER: "@hidden=='0'",
      },
    )
  } catch (e) {
    if (e.message === 'Index already exists') {
      log(`${pierOwnerNamesIndex} ${e.message}.  Skipping ahead.`)
    } else {
      error(e)
      throw new Error(e.message, { cause: e })
    }
  }
  // create an index for piers marked as public
  const pierPublicIndex = `${DB_PREFIX}:idx:piers:public`
  try {
    // log(await redis.ft.dropIndex(pierPublicIndex))
    log(`pierPublicIndex name: ${pierPublicIndex}`)
    await redis.ft.create(
      pierPublicIndex,
      {
        '$.pier': {
          type: SchemaFieldTypes.TEXT,
          SORTABLE: true,
          AS: 'pier',
        },
        '$.public': {
          type: SchemaFieldTypes.TAG,
          SORTABLE: true,
          AS: 'public',
        },
      },
      {
        ON: 'JSON',
        PREFIX: prefix,
        FILTER: "@public=='true'",
      },
    )
  } catch (e) {
    if (e.message === 'Index already exists') {
      log(`${pierPublicIndex} ${e.message}.  Skipping ahead.`)
    } else {
      error(e)
      throw new Error(e.message, { cause: e })
    }
  }
} // END DRYRUN CHECK

const dataDir = path.resolve(appRoot, options.dataDir)
let subDirs
let town
try {
  subDirs = (await readdir(dataDir)).sort().filter((x) => /^\d/.test(x))
  log(subDirs)
  let ttlGrand = 0
  let missingLocCounter = 0
  const ttlCounts = {}
  /* eslint-disable-next-line */
  for await (const d of subDirs) {
    const pierDir = path.resolve(dataDir, d)
    log(`pier dir: ${pierDir}`)
    town = d.slice(2)
    log(`piers for town: ${town}`)
    const dir = (await readdir(pierDir)).sort()
    let ttlCounter = 0
    ttlCounts[d] = 0
    /* eslint-disable-next-line */
    for await (const pier of dir) {
      let pierJson = await readFile(path.resolve(dataDir, d, pier), 'utf-8')
      pierJson = pierJson.replace(/\n/g, '')
      pierJson = JSON.parse(pierJson)
      log(`${d}/${pier}`)

      pierJson.owners.forEach((owner, i) => {
        if (owner.member === false) {
          log(`${i}: membership type: ${owner.membershipType}`)
        }
        owner.members.forEach((m, j) => {
          log(`owner ${i}, member ${j} is ${m.hidden === 0 ? 'VISIBLE' : 'HIDDEN'}`)
        })
      })

      if (pierJson.loc.longitude === 0 && pierJson.loc.latitude === 0) {
        info(`${pierJson.pier} is missing location data.`)
        missingLocCounter += 1
      }
      log('loc: ', pierJson.loc)
      log('geohash: ', pierJson.geohash)
      log('pluscode: ', pierJson.pluscode)
      log(' ')

      if (!DRYRUN || SAVEFILES) { // DRYRUN CHECK
        // save the pier with redis-om repository
        const saved = await pierRepository.save(pierJson.pier, pierJson)
        log(saved)
      }
      ttlCounter += 1

      let sortedSet = 'DRYRUN'
      let key = 'DRYRUN'
      if (!DRYRUN || SAVEFILES) { // DRYRUN CHECK
        // Create a redis sorted set for each town, containing only its piers.
        key = `${options.keyPrefix}:piers_by_town:${town}`
        log(`${key} ${pierJson.pier}`)
        sortedSet = await redis.zAdd(key, [{ score: 0, value: pierJson.pier }])
      }
      log(`Add pier ${pierJson.pier} to set ${key}`, sortedSet)

      let allPiersSortedSet = 'DRYRUN'
      let keyAllPiers = 'DRYRUN'
      if (!DRYRUN || SAVEFILES) { // DRYRUN CHECK
        // Create a master sorted set of all piers, in order.
        keyAllPiers = `${options.keyPrefix}:all_piers_in_order`
        log(`${keyAllPiers} ${pierJson.pier}`)
        allPiersSortedSet = await redis.zAdd(keyAllPiers, [{ score: 0, value: pierJson.pier }])
      }
      log(`Add pier ${pierJson.pier} to set ${keyAllPiers}`, allPiersSortedSet)
    }
    ttlCounts[d] += ttlCounter
    ttlGrand += ttlCounter
  }
  if (DRYRUN) log('***************  DRYRUN  ***************')
  if (SAVEFILES) log('***************  SAVEFILES **************')
  log(`Grand Total number of pier files processed: ${ttlGrand}`)
  log(`Number of piers missing location data: ${missingLocCounter}`)
  log('Total pier files: ', ttlCounts)
  if (SAVEFILES) log('***************  SAVEFILES **************')
  if (DRYRUN) log('***************   DRYRUN  ***************')
  /* eslint-enable no-restricted-syntax */
} catch (e) {
  error(e)
  throw new Error(e.message, { cause: e })
}

// Done loading the pier data, exit process.
process.exit()
