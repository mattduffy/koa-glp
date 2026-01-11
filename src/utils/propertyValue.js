/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @summary The script to automate retrieving property values.
 * @file src/utils/propertyValue.js
 */
import path from 'node:path'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { Command } from 'commander'
import { redis_single as redis } from '../daos/impl/redis/redis-single.js'
import { _log, _error } from './logging.js'

const log = _log.extend('utils:propertyValue')
const error = _error.extend('utils:propertyValue')

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
log(aiEnv)

const program = new Command()
program.name('propertyValue')
  .requiredOption('--pier-number <pier>', 'Pier number to find a property value for.')
  .option('--dry-run', 'Dry run the command, don\'t actully change anything.')

program.parse(process.argv)
const options = program.opts()
options.dbPrefix = DB_PREFIX
log('options:', options)

const keyPath = `${options?.keyPrefix ?? options.dbPrefix}:piers:`
log(`full keyPath: ${keyPath}${options.pierNumber}`)
log(`redis.options.keyPrefix: ${redis.options.keyPrefix}`)
// process.exit()

const MODEL = 'claude-opus-4-1-20250805'

async function askClaude(address) {
  log(aiEnv.ANTHROPIC_API_KEY)
  const anthropic = new Anthropic({
    apiKey: aiEnv.ANTHROPIC_API_KEY,
  })
  // eslint-disable-next-line
  const system_prompt = [{
    type: 'text',
    text: 'You are a helpful agent.  '
    + 'You can look up realestate property values using the popular website '
    + 'https://www.zillow.com.\n'
    + 'Zillow calls their best estimate of a property\'s market value a Zestimate.\n'
    + 'Include the URL to the page on the Zillow website that where you find the '
    + 'Zestimate.\n'
    + 'If you are unable to find the Zestimate for the property, simply return the '
    + 'phrase "No Zestimate Available".',
  }]
  const query = 'I would like you to find the Zestimate for the property at this '
    + `address: ${address}.`
  log(query)
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: system_prompt, // eslint-disable-line
    messages: [{ role: 'user', content: query }],
    tools: [{
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 5,
    }],
  })
  return msg
}

async function pier(number) {
  let _pier
  if (!number) {
    throw new Error('Missing pier number.')
  }
  try {
    _pier = await redis.json.get(number)
    log(pier)
  } catch (e) {
    error(e)
    throw new Error(`Failed retreiving pier ${number}`, { cause: e })
  }
  return _pier
}
try {
  const result = await pier(`${keyPath}${options.pierNumber}`)
  const addr = `${result.property.address.street}, `
    + `${result.property.address.city}, `
    + `${result.property.address.state}, `
    + `${result.property.address.zip}`
  const claudeResponse = await askClaude(addr)
  log(claudeResponse)
} catch (e) {
  error(e)
  // throw new Error(e.message, { cause: e })
  error(e.message)
  log('Try overriding the default redis user/password with ones with  more privileges.')
  log('R_PRIV_USER=<user> R_PRIV_PASSWORD=<psswd> npm run propertyValue...')
}

// Done getting property value data, exit process.
process.exit()
