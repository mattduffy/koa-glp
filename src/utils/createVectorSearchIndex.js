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
transformers.env.cacheDir = path.resolve(appRoot, aiEnv.MODEL_CACHE_DIR)
transformers.env.IS_NODE_ENV = true
// transformers.env.allowRemoteModels = false
let pipeline = await transformers.pipeline(aiEnv.EMBEDDING_TASK, aiEnv.EMBEDDING_MODEL)
// log('what is pipeline', pipeline)
// log(transformers.env)
const pipeOptions = {
  pooling: 'mean',
  normalize: true,
}

const program = new Command()
program.name('Create VSS Embeddings')
  .option('--scan-key-prefix <prefix>', 'The source data key prefix for Redis to scan.')
  .option('--scan-key-type <type>', 'The data type of the source data keys to scan.')
  .option('--scan-count <count>', 'Number to batch scan.', 20)
  .option('--scan-action <addVss|delVss|knn|vsAdd|vsDel>', 'Action during scan iteration.')
  .option('--vector-set-name <vector-set>', 'Name of vector set to create/add to.')
  .option('--vss-idx-name <idx-name>', 'Name of VSS index to create.')
  .option('--vss-embeddings-prefix <key-prefix>', 'The prefix VSS embeddings key to search.')
  .option('--delete-vss-embeddings', 'Delete all vss embeddings for a given key prefix.')
  .option('--knn-query <query>', 'Term to KNN search.')
  .option('--test', 'If used, add \'test:\' to the key prefix.')

program.parse(process.argv)
const options = program.opts()
if (options.test) {
  options.dbPrefix = `${DB_PREFIX}:test`
} else {
  options.dbPrefix = DB_PREFIX
}
log('options:', options)

let scanKeyPrefix
if (options?.scanKeyPrefix && options?.scanKeyPrefix.slice(-1) !== ':') {
  options.scanKeyPrefix += ':'
}
log('options.scanKeyPrefix', options.scanKeyPrefix)
scanKeyPrefix = `${options.dbPrefix}:${options.scanKeyPrefix}`
const scanKeyPrefixStar = scanKeyPrefix + '*'
log('scanKeyPrefixStar', scanKeyPrefixStar)

const vectorSet = `${options.dbPrefix}:vectors:${options?.vectorSetName}`

const idxVectorsPrefix = `${options.dbPrefix}:idx:vectors:`
const idxVectorsPiers = `${idxVectorsPrefix}${options.vssIdxName}`
const pierEmbeddingsPrefix = `${options.dbPrefix}:embeddings:pier:`
// process.exit()

async function deleteVectorIndex(idxName) {
  let result
  log('dropping vector index (if it exists): ', idxName)
  try {
    // log(await redis.ft.info(idxName))
    result = await redis.ft.dropIndex(idxName) 
  } catch (e) {
    log(`Redis responded to ft.dropIndex(${idxName}) with: ${e.message}`)
    // throw new Error('Redis Drop Index failed.', { cause: e })
  }
  return result
}

async function createVectorIndex(idxName, keyPrefix) {
  log('creating vector index:', idxName)
  log('referencing embedding keys with prefix: ', keyPrefix)
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
      '$.estateName': {
        type: SCHEMA_FIELD_TYPE.TEXT,
        AS: 'estateName',
      },
      '$.embedding': {
        type: SCHEMA_FIELD_TYPE.VECTOR,
        ALGORITHM: SCHEMA_VECTOR_FIELD_ALGORITHM.FLAT,
        TYPE: aiEnv.VECTOR_TYPE,
        DISTANCE_METRIC: aiEnv.VECTOR_DIST_METRIC,
        DIM: aiEnv.VECTOR_DIM,
        AS: 'embedding',
      },
    },
    {
      ON: 'JSON',
      PREFIX: keyPrefix,
    })
  } catch (e) {
    log(e)
    throw new Error('Redis Create Index failed.', { cause: e })
  }
  return result
}

async function jsonSet(idx, input) {
  const info = log.extend('jsonSet()')
  // info('jsonSet', idx, input)
  const pier = input.slice(5, input.indexOf(','))
  const estateName = input.slice(
    input.indexOf(',', input.indexOf(',')+1)+2,
    input.indexOf(':')
  ) 
  const content = input.toLowerCase()
  const embedding = [...(await pipeline(content, pipeOptions)).data]
  const key = pierEmbeddingsPrefix + pier
  info('pier:', pier)
  info('estate:', estateName)
  info('json key path:', key)
  info('embedding:', embedding)
  const insert = await redis.json.set(key, '$', {
    content,
    pier,
    estateName,
    embedding,
  })
  log('inserted', insert)
  return insert
}

async function knn(token) {
  const info = log.extend('knn(token)')
  info(token, idxVectorsPiers)
  const vector = Buffer.from((await pipeline(token, pipeOptions)).data.buffer)
  info(vector)
  const result = await redis.ft.search(
    idxVectorsPiers,
    // '*=>[KNN 3 @embedding $B AS score]',
    '(-@estateName:<est>)=>[KNN 4 @embedding $B AS score]',
    { PARAMS:
      {
        B: vector,
      },
      RETURN: ['score', 'pier', 'estateName'],
      SORTBY: { BY: 'score', DIRECTION: 'ASC' },
      DIALECT: 2,
    }
  )
  if (result.total > 0) {
    result.documents.forEach((d) => {
      log('pier', d)

    })
  }
}

async function vsAdd(vs, input) {
  const info = log.extend('vsAdd(vs, input)')
  const pier = input.slice(5, input.indexOf(','))
  info(`vector set: ${vs}`)
  info(`      pier: ${pier}`)
  info(`      line: ${input}`)
  info(' ')
}

async function vsDel(vs, input) {
  const info = log.extend('vsDel(vs, input)')
  const pier = input.slice(5, input.indexOf(','))
  info(`vector set: ${vs}`)
  info(`      pier: ${pier}`)
  info(`      line: ${input}`)
  info(' ')
}

async function delVss(key) {
  const info = log.extend('delVss(key)')
  const result = await redis.json.del(key)
  log('deleted?', result)
}

async function addVss(key) {
  const info = log.extend('addVss(key)')
  const pier = key 
  const street = pier.property.address.street || '<add>'
  info('street', street)
  const lines = pier.owners.map((o) => {
    return `${o.estateName || '<est>'}: `
      + `${o.members.map((m) => {
        return (m.hidden === 0) ? `${m.f} ${m.l}` : '<unk>'
      }).join(', ')}`
  }).join(', ')
  const text = `pier ${pier.pier}, ${street}, ${lines}`
  info(text)
  if (options.vectorSetName) {
    await vAdd(vectorSet, text)
  }
  if (options.vssIdxName) {
    await jsonSet(idxVectorsPiers, text)
  }
}

async function scan(keyPath=null) {
  const info = log.extend('scan()')
  const scanArgs = {
    CURSOR: '0',
    COUNT:  options.scanCount,
  }
  if (options.scanKeyPrefix) {
    scanArgs.MATCH = (keyPath !== null) ? keyPath : scanKeyPrefixStar
  }
  if (options.scanKeyType) {
    scanArgs.TYPE = options.scanKeyType
  }
  info(scanArgs)
  const myIterator = await redis.scanIterator(scanArgs)
  let batch
  let count = 0
  while (batch = await myIterator.next()) {
    if (batch.done) {
      break
    }
    for await (const k of batch.value) {
      const key = await redis.json.get(k)
      switch(options.scanAction) {
        case 'addVss':
          info('key', key)
          await addVss(key)
          break
        case 'delVss':
          // await delVss(key)
          info('deleting:', k, key.content)
          await delVss(k)
          break
        case 'vsAdd':
          await vsAdd(options.vectorSetName, key)
          break
        case 'vsDel':
          await vsDel(options.vectorSetName, key)
          break
        case 'knn':
          await knn(options.knnQuery)
          break
        default:
          info(key)
      }
      count += 1
    }
  }
  return count
}
let scanResult
let deleteResult
let createResult
try {
  if (options?.vssIdxName && ['addVss', 'delVss'].includes(options?.scanAction)) {
    log('dropping and recreating vss index:', idxVectorsPiers)
    deleteResult = await deleteVectorIndex(idxVectorsPiers)
    createResult = await createVectorIndex(idxVectorsPiers, pierEmbeddingsPrefix)
  }
  if (options?.scanAction) {
    scanResult = await scan()
    log(`keys scanned ${scanKeyPrefixStar}?`, scanResult)
  } else if (options?.knnQuery) {
    await knn(options.knnQuery)
  }
  
} catch (e) {
  error(e)
  // throw new Error(e.message, { cause: e })
  console.error(e.message)
  console.info('Try overriding the default redis user/psswd with privileged ones.')
  console.info('R_PRIV_USER=<user> R_PRIV_PASSWORD=<psswd> npm run createVectorSearchIndex ...')
}

// Done deleting the data, exit process.
process.exit()
