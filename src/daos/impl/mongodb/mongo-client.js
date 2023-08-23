/**
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/daos/imple/mongodb/mongo-client.js The low-level connection object of mongodb.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MongoClient, ObjectId } from 'mongodb'
import * as Dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(`${__dirname}/../../../..`)
// console.log('mongo-client.js >>root = ', root)
const showDebug = process.env.NODE_ENV !== 'production'
const mongodbEnvPath = path.resolve(root, 'config/mongodb.env')
console.log(`mongo-client env path: ${mongodbEnvPath}`)
const mongoEnv = {}
// Dotenv.config({ path: mongodbEnvPath, debug: showDebug })
Dotenv.config({ path: mongodbEnvPath, processEnv: mongoEnv, debug: showDebug })

// const clientDn = process.env.MONGODB_CLIENT_DN
// const dbHost = process.env.MONGODB_HOST
// const dbPort1 = process.env.MONGODB_PORT_1
// const dbPort2 = process.env.MONGODB_PORT_2
// const dbPort3 = process.env.MONGODB_PORT_3
// const dbName = process.env.MONGODB_DBNAME
// const appName = process.env.MONGODB_APPNAME
// const clientPEMFile = encodeURIComponent(process.env.MONGODB_CLIENT_KEY)
// const dbCAKeyFile = encodeURIComponent(process.env.MONGODB_CAKEYFILE)
const clientDn = mongoEnv.MONGODB_CLIENT_DN
const dbHost = mongoEnv.MONGODB_HOST
const dbPort1 = mongoEnv.MONGODB_PORT_1
const dbPort2 = mongoEnv.MONGODB_PORT_2
const dbPort3 = mongoEnv.MONGODB_PORT_3
const dbName = mongoEnv.MONGODB_DBNAME
const appName = mongoEnv.MONGODB_APPNAME
const authMechanism = 'MONGODB-X509'
const authSource = '$external'
const clientPEMFile = encodeURIComponent(mongoEnv.MONGODB_CLIENT_KEY)
const dbCAKeyFile = encodeURIComponent(mongoEnv.MONGODB_CAKEYFILE)
const uri = `mongodb://${clientDn}@${dbHost}:${dbPort1},${dbHost}:${dbPort2},${dbHost}:${dbPort3}/${dbName}?replicaSet=myReplicaSet&authMechanism=${authMechanism}&tls=true&tlsCertificateKeyFile=${clientPEMFile}&tlsCAFile=${dbCAKeyFile}&authSource=${authSource}&appName=${appName}`

console.log(clientDn)
console.log(dbHost)

const client = new MongoClient(uri)

export {
  uri,
  dbName,
  client,
  ObjectId,
}
