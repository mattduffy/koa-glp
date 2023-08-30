/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/utils/loadData.js The script to load pier data into the database.
 */

import path from 'node:path'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
/* eslint-disable-next-line */
import { Command } from 'commander'
import * as mongoClient from '../daos/impl/mongodb/mongo-client.js'
import * as redis from '../daos/impl/redis/redis-client.js'
import { _log, _error } from './logging.js'

const log = _log.extend('utils:load-data')
const error = _error.extend('utils:load-data')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.resolve(`${__dirname}/../..`)
const appEnv = {}
log(`appRoot: ${appRoot}`)
dotenv.config({ path: path.resolve(appRoot, 'config/app.env'), processEnv: appEnv, debug: true })
// log(appEnv)
// const mongoEnv = {}
// dotenv.config({ path: path.resolve(appRoot, 'config/mongodb.env'), processEnv: mongoEnv, debug: true })
// log(mongoEnv)

const program = new Command()
program.name('newUser')
  .requiredOption('')
  .requiredOption('')
  .requiredOption('')
  .requiredOption('')

program.parse(process.argv)
const options = program.opts()
log(options)

const ctx = {
  app: {
    root: appRoot,
    dirs: {
      public: {
        dir: `${appRoot}/public`,
      },
      private: {
        dir: `${appRoot}/private`,
      },
    },
  },
}



// log(mongoClient.uri)
// log('[newUser] DB credentials in use: %O', userProps.client.options.credentials)
// log('[newUser] DB name in use: ', userProps.client.options.dbName)



// Done loading the pier data, exit process.
process.exit()
