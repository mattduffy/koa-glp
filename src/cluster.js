/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @summary The Node.js cluster module entry point the Geneva Lake Piers app.
 * @file src/cluster.js
 */

import cluster from 'node:cluster'
import { availableParallelism } from 'node:os'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import process from 'node:process'

const __dirname = dirname(fileURLToPath(import.meta.url))
console.info(`${__dirname}/index.js`)

const numCores = process.env.CORES ?? availableParallelism()
cluster.setupPrimary({
  exec: `${__dirname}/index.js`,
  args: [],
  silent: false,
})
if (cluster.isPrimary) {
  console.log(`Primary cluster process ${process.pid} (of ${numCores} total cores) running`)
  for (let i = 0; i < numCores; i += 1) {
    cluster.fork()
  }
  cluster.on('exit', (worker, code, signal) => {
    console.warn(`cluster:primary:${cluster.pid} worker process ${worker.pid} died with signal: ${signal}.`)
    if (cluster.workers.length < numCores) {
      console.warn(`cluster:primary:${cluster.pid} Forking a new work to replace it.`)
      cluster.fork()
    }
  })
}
