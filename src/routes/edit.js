/**
 * @summary Koa router for editing the main top-level pages.
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/edit.js The router for editing the top level app URLs.
 */

import Router from '@koa/router'
import { ulid } from 'ulid'
import formidable from 'formidable'
// import { Albums } from '@mattduffy/albums/Albums' // eslint-disable-line import/no-unresolved
// import { AggregateGroupByReducers, AggregateSteps } from 'redis'
import {
  _log,
  _info,
  _error,
  getSetName,
} from '../utils/logging.js'
import { redis } from '../daos/impl/redis/redis-om.js'
// import { redis as ioredis } from '../daos/impl/redis/redis-client.js'

const editLog = _log.extend('edit')
const editInfo = _info.extend('edit')
const editError = _error.extend('edit')
/* eslint-disable-next-line no-unused-vars */
function sanitize(param) {
  // fill in with some effective input scubbing logic
  return param
}

const router = new Router()

async function hasFlash(ctx, next) {
  const log = editLog.extend('hasFlash')
  const error = editError.extend('hasFlash')
  if (ctx.flash) {
    log('ctx.flash is present: %o', ctx.flash)
  } else {
    error('ctx.flash is missing.')
  }
  await next()
}

router.get('editPier-GET', '/edit/pier/:pier', hasFlash, async (ctx) => {
  const log = editLog.extend('GET-editPier')
  const info = editInfo.extend('INFO-editPier')
  const error = editError.extend('GET-editPier')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    const pierNumber = sanitize(ctx.params.pier)
    const locals = {}
    const key = `glp:piers:${pierNumber}`
    let pier
    let town
    info(pierNumber)
    if (pierNumber.length > 6 || !/^\d/.test(pierNumber)) {
      error('Pier number looks invalid')
      error(pierNumber.length, !/^\d/.test(pierNumber))
      locals.pier = `${pierNumber} is not a valid pier number.`
    }
    let setTown
    try {
      /* eslint-disable-next-line */
      for (const set of ctx.state.TOWNS) {
        let found = false
        const setkey = `glp:piers_by_town:${set}`
        log(setkey, pierNumber)
        /* eslint-disable-next-line */
        for await (const { value } of redis.zScanIterator(setkey, { MATCH: pierNumber, COUNT: 900 })) {
          if (value !== null) {
            town = set.split('_').map((e) => e.toProperCase()).join(' ')
            setTown = set
            log(`Found ${value} in ${set}`)
            found = true
          }
        }
        if (found) break
      }
    } catch (e) {
      error(e)
      throw new Error(`Could not match pier ${pierNumber} to any town set in redis.`, { cause: e })
    }
    try {
      pier = await redis.json.get(key)
      locals.pier = pier
      log(pier)
    } catch (e) {
      error(e)
      throw new Error(`Failed to get pier ${pierNumber}`, { cause: e })
    }
    locals.town = town
    locals.photo = false
    locals.setTown = setTown
    locals.pierNumber = pierNumber
    locals.flash = ctx.flash.view ?? {}
    locals.title = `${ctx.app.site}: Pier ${pierNumber}`
    locals.sessionUser = ctx.state.sessionUser
    locals.isAuthenticated = ctx.state.isAuthenticated
    await ctx.render('edit-pier', locals)
  }
})

export { router as edit }
