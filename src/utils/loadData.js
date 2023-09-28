/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/utils/loadData.js The script to load pier data into redis.
 */
/* eslint-disable import/no-extraneous-dependencies */
import path from 'node:path'
import {
  // opendir,
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
  // Client,
  // EntityId,
  Schema,
  Repository,
} from '../daos/impl/redis/redis-om.js'
import { _log, _error } from './logging.js'
/* eslint-enable import/no-extraneous-dependencies */

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
log(clientOm)

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
try {
  log(`pierNumberIndex name: ${pierNumberIndex}`)
  await redis.ft.create(
    pierNumberIndex,
    {
      '$.pier': {
        type: SchemaFieldTypes.TAG,
        AS: 'pier',
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
// create an index for estateName
const pierOwnerEstatename = `${DB_PREFIX}:idx:piers:estateName`
try {
  log(`pierOwnerEstatename name: ${pierOwnerEstatename}`)
  await redis.ft.create(
    pierOwnerEstatename,
    {
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
    log(`${pierOwnerEstatename} ${e.message}.  Skipping ahead.`)
  } else {
    error(e)
    throw new Error(e.message, { cause: e })
  }
}

// create an index for owner's firstname and lastname
const pierOwnerNames = `${DB_PREFIX}:idx:piers:ownerNames`
try {
  log(`pierOwnerNames name: ${pierOwnerNames}`)
  await redis.ft.create(
    pierOwnerNames,
    {
      '$.owners[*].members[*].f': {
        type: SchemaFieldTypes.TEXT,
        SORTABLE: true,
        AS: 'firstname',
      },
    },
    {
      '$.owners[*].members[*].l': {
        type: SchemaFieldTypes.TEXT,
        SORTABLE: true,
        AS: 'lastname',
      },
    },
    {
      ON: 'JSON',
      PREFIX: prefix,
    },
  )
} catch (e) {
  if (e.message === 'Index already exists') {
    log(`${pierOwnerEstatename} ${e.message}.  Skipping ahead.`)
  } else {
    error(e)
    throw new Error(e.message, { cause: e })
  }
}

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
      pierJson.owners.forEach((owner, i) => {
        if (owner.member === false) {
          log(`${i}: membership type: ${owner.membershipType}`)
        }
      })
      if (pierJson.loc.lon === 0.0 && pierJson.loc.lat === 0.0) {
        missingLocCounter += 1
      }
      // pierJson.geohash = pierJson.loc.geohash
      // delete pierJson.loc.geohash
      // pierJson.pluscode = pierJson.loc.pluscode
      // delete pierJson.loc.pluscode
      log(`${d}/${pier}`)
      // pierJson.loc.longitude = pierJson.loc.lon
      // pierJson.loc.latitude = pierJson.loc.lat
      // delete pierJson.loc.lon
      // delete pierJson.loc.lat
      log('loc: ', pierJson.loc)
      log('geohash: ', pierJson.geohash)
      log('pluscode: ', pierJson.pluscode)
      log(' ')

      // save the pier with redis-om repository
      const saved = await pierRepository.save(pierJson.pier, pierJson)
      log(saved)
      ttlCounter += 1

      // Create a redis sorted set for each town, containing only its piers.
      const key = `${options.keyPrefix}:piers_by_town:${town}`
      log(`${key} ${pierJson.pier}`)
      const sortedSet = await redis.zAdd(key, [{ score: 0, value: pierJson.pier }])
      log(`Add pier ${pierJson.pier} to set ${key}`, sortedSet)

      // Create a master sorted set of all piers, in order.
      const keyAllPiers = `${options.keyPrefix}:all_piers_in_order`
      log(`${keyAllPiers} ${pierJson.pier}`)
      const allPiersSortedSet = await redis.zAdd(keyAllPiers, [{ score: 0, value: pierJson.pier }])
      log(`Add pier ${pierJson.pier} to set ${keyAllPiers}`, allPiersSortedSet)
    }
    ttlCounts[d] += ttlCounter
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
