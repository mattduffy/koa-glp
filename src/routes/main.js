/**
 * @summary Koa router for the main top-level pages.
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/main.js The router for the top level app URLs.
 */

import Router from '@koa/router'
// import { ObjectId } from 'mongodb'
import { Albums } from '@mattduffy/albums/Albums' // eslint-disable-line import/no-unresolved
// import { Users } from '../models/users.js'
import { _log, _error, getSetName } from '../utils/logging.js'
import { redis } from '../daos/impl/redis/redis-om.js'
import { redis as ioredis } from '../daos/impl/redis/redis-client.js'

const mainLog = _log.extend('main')
const mainError = _error.extend('main')
/* eslint-disable-next-line no-unused-vars */
function sanitize(param) {
  // fill in with some effective input scubbing logic
  return param
}

const router = new Router()
async function hasFlash(ctx, next) {
  const log = mainLog.extend('hasFlash')
  const error = mainError.extend('hasFlash')
  if (ctx.flash) {
    log('ctx.flash is present: %o', ctx.flash)
  } else {
    error('ctx.flash is missing.')
  }
  await next()
}

// async function pierInTown(pier) {
//   const towns = 0
// }

router.get('index', '/', hasFlash, async (ctx) => {
  const log = mainLog.extend('index')
  // const error = mainError.extend('index')
  log('inside main router: /')
  ctx.status = 200
  log(`sessionUser.isAuthenticated: ${ctx.state.isAuthenticated}`)
  await ctx.render('index', {
    // origin: ctx.request.origin,
    // siteName: ctx.app.site,
    // appName: ctx.app.site.toProperCase(),
    // stylesheets: [],
    // nonce: ctx.app.nonce,
    sessionUser: ctx.state.sessionUser,
    body: ctx.body,
    flash: ctx.flash?.index ?? {},
    title: `${ctx.app.site}: Home`,
    isAuthenticated: ctx.state.isAuthenticated,
    items: ['thing one to do.', 'thing two to do'],
  })
})

router.get('piersByTown', '/towns/:town', hasFlash, async (ctx) => {
  const log = mainLog.extend('GET-piersByTown')
  const error = mainError.extend('GET-piersByTown')
  const town = getSetName(sanitize(ctx.params.town))
  log(town)
  let piersInTown
  const key = `glp:piers_by_town:${town}`
  log(`key: ${key}`)
  try {
    piersInTown = await redis.zRange(key, 0, -1)
  } catch (e) {
    error(e)
    ctx.throw(500, 'Error', { town })
  }
  const locals = {}
  locals.piers = piersInTown
  locals.flash = ctx.flash.view ?? {}
  locals.title = `${ctx.app.site}: ${town}`
  locals.sessionUser = ctx.state.sessionUser
  locals.isAuthenticated = ctx.state.isAuthenticated
  locals.town = town.split('_').map((e) => e.toProperCase()).join(' ')
  await ctx.render('town', locals)
})

router.get('pierByNumber', '/pier/:pier', hasFlash, async (ctx) => {
  const log = mainLog.extend('GET-pierByNumber')
  const error = mainLog.extend('GET-pierByNumber')
  const pierNumber = sanitize(ctx.params.pier)
  const locals = {}
  const key = `glp:piers:${pierNumber}`
  let pier
  let town
  log(pierNumber)
  if (pierNumber.length > 6 || !/^\d/.test(pierNumber)) {
    error('Pier number looks invalid')
    error(pierNumber.length, !/^\d/.test(pierNumber))
    locals.pier = `${pierNumber} is not a valid pier number.`
  }
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
    log(pier)
  } catch (e) {
    error(e)
  }
  log(ctx.state.TOWNS)
  locals.pier = pier
  locals.town = town
  locals.photo = false
  locals.pierNumber = pierNumber
  locals.flash = ctx.flash.view ?? {}
  locals.title = `${ctx.app.site}: Pier ${pierNumber}`
  locals.sessionUser = ctx.state.sessionUser
  locals.isAuthenticated = ctx.state.isAuthenticated
  await ctx.render('pier', locals)
})

router.get('galleries', '/galleries', hasFlash, async (ctx) => {
  const log = mainLog.extend('galleries')
  const error = mainError.extend('galleries')
  log('inside index router: /galleries')
  ctx.status = 200
  let recent10
  try {
    recent10 = await Albums.recentlyAdded(ioredis)
  } catch (e) {
    error(e)
  }
  log('recent10: ', recent10)
  if (recent10?.length < 1) {
    recent10 = [
      { name: 'one' },
      { name: 'two' },
      { name: 'three' },
      { name: 'four' },
      { name: 'five' },
      { name: 'six' },
      { name: 'seven' },
    ]
  }
  let userAlbums
  try {
    userAlbums = await Albums.usersWithPublicAlbums(ctx.state.mongodb.client.db())
  } catch (e) {
    error(e)
  }
  if (userAlbums?.length < 1) {
    userAlbums = [
      { ownerUsername: '@user1', url: '/@user1' },
      { ownerUsername: '@user1', url: '/@user1' },
      { ownerUsername: '@user1', url: '/@user1' },
    ]
  }
  log('userAlbums: ', userAlbums)
  await ctx.render('galleries', {
    recent10,
    userAlbums,
    body: ctx.body,
    origin: ctx.request.origin,
    flash: ctx.flash?.galleries ?? {},
    title: `${ctx.app.site}: Galleries`,
    sessionUser: ctx.state.sessionUser,
    isAuthenticated: ctx.state.isAuthenticated,
  })
})

router.get('about', '/about', hasFlash, async (ctx) => {
  const log = mainLog.extend('about')
  // const error = mainError.extend('about')
  log('inside index router: /about')
  ctx.status = 200
  await ctx.render('about', {
    body: ctx.body,
    title: `${ctx.app.site}: About`,
    sessionUser: ctx.state.sessionUser,
    isAuthenticated: ctx.state.isAuthenticated,
  })
})

router.get('contact', '/contact', hasFlash, async (ctx) => {
  const log = mainLog.extend('contact')
  // const error = mainError.extend('contact')
  log('inside index router: /contact')
  ctx.status = 200
  await ctx.render('contact', {
    title: `${ctx.app.site}: Contact`,
    sessionUser: ctx.state.sessionUser,
    isAuthenticated: ctx.state.isAuthenticated,
  })
})

router.get('renderTest', '/renderTest', async (ctx) => {
  const log = mainLog.extend('renderTest')
  const rendered = await ctx.render('renderTest', {
    title: `${ctx.app.site}: render test`,
    user: ctx.state?.user ?? 'Matt',
    sessionUser: ctx.state?.sessionUser ?? {},
    isAuthenticated: false,
  })
  log(rendered)
  ctx.redirect('/')
})

export { router as main }
