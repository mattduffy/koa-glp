/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @summary The script to create vector search index in redis.
 * @file src/utils/createVectorSearchIndex.js
 */
import path from 'node:path'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { redis_single as redis } from '../daos/impl/redis/redis-single.js'
import { _log, _error } from './logging.js'

const log = _log.extend('utils:create-vector-search-index')
const error = _error.extend('utils:create-vector-search-index')

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
program.name('deleteData')
  .requiredOption('--key-prefix <prefix>', 'The app-specific key prefix for Redis to use.')
  .requiredOption('--key-type <type>', 'The redis data type of the keys to scan.', 'ReJSON-RL')
  .requiredOption('--idx-name <name>', 'The index name for Redis to create.')
  .option('--count <count>', 'Number to batch scan.', 20)

program.parse(process.argv)
const options = program.opts()
options.dbPrefix = DB_PREFIX
log('options:', options)

let keyPrefix
if (options.keyPrefix.slice(-1) !== ':') {
  options.keyPrefix += ':'
}
keyPrefix = `${options.keyPrefix}*`
// process.exit()

async function del() {
  const scanArgs = {
    CURSOR: '0',
    MATCH: keyPrefix,
    TYPE: options.keyType,
    COUNT: options.keyCount,
  }
  log(scanArgs)
  const myIterator = await redis.scanIterator(scanArgs)
  let batch
  let count = 0
  while (batch = await myIterator.next()) {
    if (batch.done) {
      break
    }
    // batch.value.forEach((k) => {
    for await (const k of batch.value) {
      const pier = await redis.json.get(k)
      const prop = pier.property
      const addr = pier.property.address
      // const estateNames = pier.owners.map((o) => {
      //   if (o.estateName !== '') {
      //     return o.estateName
      //   } else {
      //     return '##' 
      //   }
      // })
      const lines = pier.owners.map((o) => {
        return `${o.estateName || '##'}: `
          + `${o.members.map((m) => { return `${m.f} ${m.l}` }).join(', ')}`
      }).join(', ')
      // const owners = pier.owners.map((o) => {
      //   return o.members.reduce
      // })
      const text = `pier ${pier.pier}, ${lines}`
      console.log(text)
      count += 1
    }
    // console.log(batch)
  }
  return count
}
try {
  const result = await del()
  log(`keys scanned ${keyPrefix}?`, result)
} catch (e) {
  error(e)
  // throw new Error(e.message, { cause: e })
  console.error(e.message)
}

// Done deleting the data, exit process.
process.exit()
