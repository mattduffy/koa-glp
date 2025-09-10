/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @summary The script to create vector search index in redis.
 * @file src/utils/createVectorSearchIndex.js
 */
import path from 'node:path'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import * as transformers from '@xenova/transformers'
import {
  SCHEMA_VECTOR_FIELD_ALGORITHM,
  createClient,
  SCHEMA_FIELD_TYPE,
} from 'redis'
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
const aiEnv = {}
dotenv.config({
  path: path.resolve(appRoot, 'config/ai.env'),
  processEnv: aiEnv,
})
log('aiEnv', aiEnv)
transformers.env.localModelPath = path.resolve(appRoot, aiEnv.MODEL_CACHE_DIR)
// transformers.env.allowRemoteModels = false
let pipeline = transformers.pipeline(aiEnv.EMBEDDING_TASK, aiEnv.EMBEDDING_MODEL)
const pipeOptions = {
  pooling: 'mean',
  normalize: true,
}

const program = new Command()
program.name('deleteData')
  .requiredOption('--scan-key-prefix <prefix>', 'The key prefix for Redis to scan.')
  .requiredOption('--scan-key-type <type>', 'The redis data type of the keys to scan.')
  .option('--scan-count <count>', 'Number to batch scan.', 20)
  .option('--vector-set-name <vector-set>', 'Name of vector set to create/add to.')
  .option('--vector-idx-name <idx-name>', 'Name of vector search index to create.')
  .option('--idx-name <name>', 'The index name for Redis to create.')

program.parse(process.argv)
const options = program.opts()
options.dbPrefix = DB_PREFIX
log('options:', options)

let scanKeyPrefix
if (options.scanKeyPrefix.slice(-1) !== ':') {
  options.scanKeyPrefix += ':'
}
scanKeyPrefix = `${options.scanKeyPrefix}`
const scanKeyPrefixStar = scanKeyPrefix + '*'

const vectorSet = `${options.dbPrefix}:vectors:${options?.vectorSetName}`

const keyPrefixIdxVectors = `${options.dbPrefix}:idx:vector:`
const pierIdxVector = `${keyPrefixIdxVectors}${options.vectorIdxName}`
// const pierEmbeddingsPrefix = `${keyPrefix}embeddings:pier:`
// process.exit()

async function deleteVectorIndex(idxName) {
  let result
  // const pierVectorIndex = `${keyPrefixIdxVectors}${idxName}`
  log('dropping vector index (if it exists): ', idxName)
  try {
    log(await redis.ft.info(idxName))
    result = await redis.ft.dropIndex(idxName) 
  } catch (e) {
    log(`Redis responded to ft.dropIndex(${idxName}) with: ${e.message}`)
    // throw new Error('Redis Drop Index failed.', { cause: e })
  }
  return result
}

async function createVectorIndex(idxName) {
  log('creating vector index:', idxName)
  log('referencing embedding keys with prefix: ', pierEmbeddingsPrefix)
  let result
  try {
    result = await redis.ft.create(idxName, {
      '$.content': {
        type: SCHEMA_FIELD_TYPE.TEXT,
        AS: 'content',
      },
      '$.pier': {
        type: SCHEMA_FIELD_TYPE.TAG,
        AS: 'pier',
      },
      '$.embedding': {
        type: SCHEMA_FIELD_TYPE.VECTOR,
        TYPE: 'FLOAT32',
        ALGORITHM: SCHEMA_VECTOR_FIELD_ALGORITHM.FLAT,
        DISTANCE_METRIC: 'COSINE',
        DIM: 768,
        AS: 'embedding',
      },
    },
    {
      ON: 'JSON',
      PREFIX: pierEmbeddingsPrefix,
    })
  } catch (e) {
    log(e)
    throw new Error('Redis Create Index failed.', { cause: e })
  }
  return result
}

async function vAdd(vs, input) {
  const pier = input.slice(5, input.indexOf(','))
  log(`vector set: ${vs}`)
  log(`      pier: ${pier}`)
  log(`      line: ${input}`)
  log(' ')

}

async function jsonSet(idx, input) {

}

async function scan() {
  const scanArgs = {
    CURSOR: '0',
    MATCH: `${options.scanKeyPrefix}*`,
    TYPE: options.scanKeyType,
    COUNT: options.scanCount,
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
      // const property = pier.property
      const street = pier.property.address.street || '<ADDR>'
      const lines = pier.owners.map((o) => {
        return `${o.estateName || '<ESTA>'}: `
          + `${o.members.map((m) => {
            return (m.hidden === 0) ? `${m.f} ${m.l}` : '<UNKN>'
          }).join(', ')}`
      }).join(', ')
      const text = `pier ${pier.pier}, ${street}, ${lines}`
      console.log(text)
      if (options.vectorSetName) {
        await vAdd(vectorSet, text)
      }
      if (options.vectorIdxName) {
        await jsonSet(pierIdxVector, text)
      }
      count += 1
    }
  }
  return count
}
let deleteResult
let createResult
try {
  if (options.vectorIdxName) {
    deleteResult = await deleteVectorIndex(pierIdxVector)
    createResult = await createVectorIndex(pierIdxVector)
  }
  const scanResult = await scan()
  log(`keys scanned ${scanKeyPrefixStar}?`, scanResult)
} catch (e) {
  error(e)
  // throw new Error(e.message, { cause: e })
  console.error(e.message)
  console.info('Try overriding the default redis user/psswd with privileged ones.')
  console.info('R_PRIV_USER=<user> R_PRIV_PASSWORD=<psswd> npm run createVectorSearchIndex ...')
}

// Done deleting the data, exit process.
process.exit()
