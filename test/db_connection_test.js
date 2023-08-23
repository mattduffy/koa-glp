/**
 * @file ./tests/db_connection_test.js
 */

import * as Dotenv from 'dotenv'
import { MongoClient } from 'mongodb'
// import bcrypt from 'bcrypt'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import fs from 'node:fs'
import Debug from 'debug'

const debug = Debug('users:db_conn_test')

const mongodbEnv = {}
Dotenv.config({ path: './config/mongodb.env', processEnv: mongodbEnv })

const jwtIssuer = mongodbEnv.JWT_ISSUER

const dbName = mongodbEnv.DB_NAME
// const colName = mongodbEnv.COLLECTION_NAME
const clientDn = mongodbEnv.MONGODB_CLIENT_DN
const dbHost = mongodbEnv.MONGODB_HOST
const dbPort1 = mongodbEnv.MONGODB_PORT_1
const dbPort2 = mongodbEnv.MONGODB_PORT_2
const dbPort3 = mongodbEnv.MONGODB_PORT_3
const authMechanism = 'MONGODB-X509'
const authSource = '$external'
const clientPEMFile = encodeURIComponent(mongodbEnv.MONGODB_CLIENT_KEY)
const dbCAKeyFile = encodeURIComponent(mongodbEnv.MONGODB_CAKEYFILE)
const uri = `mongodb://${clientDn}@${dbHost}:${dbPort1},${dbHost}:${dbPort2},${dbHost}:${dbPort3}/${dbName}?replicaSet=myReplicaSet&authMechanism=${authMechanism}&tls=true&tlsCertificateKeyFile=${clientPEMFile}&tlsCAFile=${dbCAKeyFile}&authSource=${authSource}`

// debug(uri)

const client = new MongoClient(uri)

function gID() {
  const arr = []
  for (let i = 0; i <= 6; i += 1) {
    arr.push(crypto.randomBytes(2).toString('hex'))
  }
  return arr.join('-')
}

function gT() {
  const secret = fs.readFileSync(mongodbEnv.JWT_PRIKEY)
  const toptions = {
    algorithm: 'HS256', expiresIn: '30m', issuer: jwtIssuer, subject: 'matt', audience: 'access', jwtid: gID(),
  }
  const roptions = {
    algorithm: 'HS256', expiresIn: '5m', issuer: jwtIssuer, subject: 'matt', audience: 'refresh', jwtid: gID(),
  }
  const token = jwt.sign({ email: 'matt@mattmail.email' }, secret, toptions)
  const refresh = jwt.sign({ email: 'matt@mattmail.email' }, secret, roptions)
  return { token, refresh }
}

async function run() {
  try {
    await client.connect()
    const database = client.db(dbName)
    const collection = database.collection('test')

    const cursor = await collection.find()
    // debug(cursor)
    if (collection.estimatedDocumentCount === 0) {
      debug('no documents found')
    }
    // await cursor.forEach(console.dir)
    return await cursor
  } finally {
    await client.close()
  }
}

// run().catch(console.dir)

async function insertOne() {
  const doc = {
    uid: gID(),
    name: 'Matt',
    email: 'matt@mattmail.email',
    password: await bcrypt.hash('9@zzw0rd', 10),
    jwt: gT(),
  }
  debug(doc)
  try {
    await client.connect()
    const database = client.db(dbName)
    const collection = database.collection('test')
    const result = await collection.insertOne(doc)
    debug(`document inserted into test collection with _id: ${result.insertedId}`)
  } catch (e) {
    console.error(e)
  } finally {
    await client.close()
  }
}

export {
  client,
  run,
  insertOne,
  gID,
  gT as genTokens,
}
