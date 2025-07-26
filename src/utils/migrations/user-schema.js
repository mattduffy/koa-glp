/**
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @summary Schema migrations for the User object model.
 * @file src/utils/migrations/user-schema.js
 */

import { client } from '../../daos/impl/mongodb/mongo-client.js'

const database = 'mattmadethese'
const userCollection = 'users'
const migrationCollection = 'migrations'

await client.connect()
const userSchema = client.db(database).collection(userCollection)
const migration = client.db(database).collection(migrationCollection)
const userMigration = await migration.find({ schema: 'user' }).sort({ migrationDate: -1 })
if (await userMigration.hasNext()) {
  const latest = await userMigration.next()
  const d = new Date(latest.migrationDate)
  console.log('Latest userMigration cursor value:')
  console.log(`>>>>>>>   schema: ${latest.schema}`)
  console.log(`>>>>>>>  version: ${latest.version}`)
  console.log(`>>>>>>> date ran: ${d.toTimeString()}`)
} else {
  console.log('Empty userMigration cursor')
}
