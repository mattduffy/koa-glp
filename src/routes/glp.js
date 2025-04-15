/**
 * @summary Koa router for the main top-level pages.
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/glp.js The router for the top level app URLs.
 */

import Router from '@koa/router'
import { ulid } from 'ulid'
// import formidable from 'formidable'
import { Albums } from '@mattduffy/albums/Albums' // eslint-disable-line import/no-unresolved
import { AggregateGroupByReducers, AggregateSteps } from 'redis'
import {
  addIpToSession,
  doTokensMatch,
  processFormData,
  hasFlash,
} from './middlewares.js'
import {
  _log,
  _error,
  getSetName,
  TOWNS,
} from '../utils/logging.js'
import { redis } from '../daos/impl/redis/redis-om.js'
import { redis as ioredis } from '../daos/impl/redis/redis-client.js'

const glpLog = _log.extend('glp')
const glpError = _error.extend('glp')
function sanitize(param) {
  // fill in with some effective input scubbing logic
  return param
}

function leftZeroPad(x) {
  let pierNumber = x
  const matches = x.match(/^(?<numbers>\d{1,3}(?<decimal>\.\d)?)(?<letters>[A-Za-z]{0,3})/)
  if (!matches) {
    return null
  }
  const numbersLength = parseInt(matches.groups.numbers, 10).toString().length
  if (numbersLength < 3) {
    pierNumber = parseInt(matches.groups.numbers, 10).toString().padStart(3, '0')
    if (matches.groups.decimal !== undefined) {
      pierNumber += matches.groups.decimal
    }
    if (matches.groups.letters !== '') {
      pierNumber += matches.groups.letters.toUpperCase()
    }
  }
  glpLog(`Pier number input: ${x}, normalized pier number output: ${pierNumber}`)
  return pierNumber
}

const router = new Router()
// async function hasFlash(ctx, next) {
//   const log = glpLog.extend('hasFlash')
//   const error = glpError.extend('hasFlash')
//   if (ctx.flash) {
//     log('ctx.flash is present: %o', ctx.flash)
//   } else {
//     error('ctx.flash is missing.')
//   }
//   await next()
// }

router.get('index', '/', hasFlash, addIpToSession, async (ctx) => {
  const log = glpLog.extend('index')
  // const error = glpError.extend('index')
  log('inside glp router: /')
  ctx.status = 200
  const locals = {}
  const items = []
  if (ctx.state.isAuthenticated) {
    // get the list of null_island piers
    const key = 'glp:null_island'
    // nextPier = await redis.zRange(key, `[${pierNumber}`, '+', { BY: 'LEX', LIMIT: { offset: 1, count: 1 } })
    const nullIsland = await redis.zRange(key, '-', '+', { BY: 'LEX' })
    log(nullIsland)
    if (nullIsland.length > 0) {
      items.push({ title: 'Piers assigned to Null Island.', list: nullIsland })
    }
  }
  log(`sessionUser.isAuthenticated: ${ctx.state.isAuthenticated}`)
  // locals.structuredData = JSON.stringify(ctx.state.structuredData, null, '\t')
  const csrfToken = ulid()
  ctx.session.csrfToken = csrfToken
  ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
  locals.csrfToken = csrfToken
  locals.body = ctx.body
  locals.flash = ctx.flash?.index ?? {}
  locals.title = `${ctx.app.site}: Home`
  locals.sessionUser = ctx.state.sessionUser
  locals.isAuthenticated = ctx.state.isAuthenticated
  locals.items = items
  await ctx.render('index', locals)
})

router.get('piersByTown', '/towns/:town', hasFlash, addIpToSession, async (ctx) => {
  const log = glpLog.extend('GET-piersByTown')
  const error = glpError.extend('GET-piersByTown')
  const town = getSetName(sanitize(ctx.params.town))
  log(town)
  let prevTown
  let nextTown
  TOWNS.forEach((t, i) => {
    if (t.replaceAll('-', '_') === town.replaceAll('-', '_')) {
      const prev = (i === 0) ? TOWNS.length - 1 : i - 1
      const next = (i < TOWNS.length - 1) ? i + 1 : 0
      // log(prev, i, next, town, t.replaceAll('-', '_'))
      prevTown = TOWNS[prev].replaceAll('_', ' ')
      nextTown = TOWNS[next].replaceAll('_', ' ')
    }
  })
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
  locals.setName = town
  locals.nextTown = nextTown.toProperCase()
  locals.previousTown = prevTown.toProperCase()
  locals.piers = piersInTown
  locals.flash = ctx.flash.view ?? {}
  locals.title = `${ctx.app.site}: ${town}`
  locals.sessionUser = ctx.state.sessionUser
  locals.isAuthenticated = ctx.state.isAuthenticated
  locals.town = town.split('_').map((e) => e.toProperCase()).join(' ')
  await ctx.render('town', locals)
})

router.get('pierBigSwimPiers', '/swim', hasFlash, addIpToSession, async (ctx) => {
  const log = glpLog.extend('GET-piersSwim')
  const error = glpError.extend('GET-piersSwim')
  if (ctx.state.isAsyncRequest === true) {
    log('Async query received.')
  }
  log(ctx.request.query.s)
  const s = (ctx.request.query?.s !== undefined) ? Math.abs(parseInt(sanitize(ctx.request.query.s), 10)) : 1
  const num = 12
  const offset = (s <= 1) ? 0 : (s - 1) * num
  const skipBack = (s <= 1) ? 0 : s - 1
  const skipForward = s + 1
  log(`s: ${s}, offset: ${offset} num: ${num.toString().padStart(2, '0')}, skipBack: ${skipBack} skipForward: ${skipForward}, remaining: 43 - ${offset} = ${43 - offset}`)
  let swimPiers
  try {
    log(`ft.aggregate glp:idx:piers:swim "*" LOAD 3 $.pier AS pier SORTBY 2 @pier ASC LIMIT ${offset} ${num}`)
    const optsAggregateSwim = {
      LOAD: ['@pier', '$.owners[*].members[*].f', 'AS', 'name'],
      STEPS: [
        {
          type: AggregateSteps.SORTBY,
          BY: '@pier',
          MAX: 1,
        },
        {
          type: AggregateSteps.LIMIT,
          from: offset,
          size: num,
        },
      ],
    }
    swimPiers = await redis.ft.aggregate('glp:idx:piers:swim', '*', optsAggregateSwim)
    log(swimPiers.total)
    log(swimPiers.results)
  } catch (e) {
    error('Failed to get list of swim piers.')
    error(e.message)
    throw new Error('Redis query failed.', { cause: e })
  }
  if (ctx.state.isAsyncRequest === true) {
    ctx.status = 200
    ctx.type = 'application/json; charset=utf8'
    ctx.body = swimPiers.results
  } else {
    const locals = {}
    locals.skipForward = skipForward
    locals.skipBack = skipBack
    locals.offset = offset
    locals.num = num
    locals.total = swimPiers.total
    locals.swim = swimPiers.results
    locals.photo = false
    locals.flash = ctx.flash.view ?? {}
    locals.title = `${ctx.app.site}: Swim Piers`
    locals.sessionUser = ctx.state.sessionUser
    locals.isAuthenticated = ctx.state.isAuthenticated
    await ctx.render('big-swim-piers', locals)
  }
})

router.get('pierPublic', '/public', hasFlash, addIpToSession, async (ctx) => {
  const log = glpLog.extend('GET-piersPublic')
  const error = glpError.extend('GET-piersPublic')
  if (ctx.state.isAsyncRequest === true) {
    log('Async query received.')
  }
  log(ctx.request.query.s)
  const x = 17
  const s = (ctx.request.query?.s !== undefined) ? Math.abs(parseInt(sanitize(ctx.request.query.s), 10)) : 1
  const num = 10
  // const offset = (s === 1) ? 0 : (s - 1) * num
  const offset = (s <= 1) ? 0 : (s - 1) * num
  const skipBack = (s <= 1) ? 0 : s - 1
  const skipForward = s + 1

  log(`s: ${s}, offset: ${offset} num: ${num.toString().padStart(2, '0')}, skipBack: ${skipBack} skipForward: ${skipForward}, remaining: ${x} - ${offset} = ${x - offset}`)
  let publicPiers
  try {
    // ft.aggregate glp:idx:piers:public "*" LOAD 3 $.pier AS pier SORTBY 2 @pier ASC LIMIT 0 100
    const optsAggregatePublic = {
      LOAD: ['@pier', '$.owners[*].members[*].f', 'AS', 'name'],
      STEPS: [
        {
          type: AggregateSteps.SORTBY,
          BY: '@pier',
          MAX: 1,
        },
        {
          type: AggregateSteps.LIMIT,
          from: offset,
          size: num,
        },
      ],
    }
    publicPiers = await redis.ft.aggregate('glp:idx:piers:public', '*', optsAggregatePublic)
    log(publicPiers.total)
    log(publicPiers.results)
  } catch (e) {
    error('Failed to get list of public piers.')
    error(e.message)
    throw new Error('Redis query failed.', { cause: e })
  }
  if (ctx.state.isAsyncRequest === true) {
    ctx.status = 200
    ctx.type = 'application/json; charset=utf-8'
    ctx.body = publicPiers.results
  } else {
    const locals = {}
    locals.s = s
    locals.num = num
    locals.offset = offset
    locals.skipBack = skipBack
    locals.skipForward = skipForward
    locals.total = publicPiers.total
    locals.public = publicPiers.results
    locals.photo = false
    locals.flash = ctx.flash.view ?? {}
    locals.title = `${ctx.app.site}: Public Piers on Geneva Lake`
    locals.sessionUser = ctx.state.sessionUser
    locals.isAuthenticated = ctx.state.isAuthenticated
    await ctx.render('public', locals)
  }
})

router.get('pierBusinesses', '/businesses', hasFlash, addIpToSession, async (ctx) => {
  const log = glpLog.extend('GET-piersBusinesses')
  const error = glpError.extend('GET-piersBusinesses')
  if (ctx.state.isAsyncRequest === true) {
    log('Async query received.')
  }
  log(ctx.request.query.s)
  const s = (ctx.request.query?.s !== undefined) ? Math.abs(parseInt(sanitize(ctx.request.query.s), 10)) : 1
  const num = 12
  const offset = (s === 1) ? 0 : (s - 1) * num
  const skipBack = (s <= 1) ? 0 : s - 1
  const skipForward = s + 1
  log(`s: ${s}, offset: ${offset} num: ${num.toString().padStart(2, '0')}, skipBack: ${skipBack} skipForward: ${skipForward}, remaining: 89 - ${offset} = ${89 - offset}`)
  let businesses
  try {
    log(`ft.AGGREGATE glp:idx:piers:business "*" LOAD 3 $.pier AS pier GROUPBY 1 @business REDUCE TOLIST 1 @pier AS pier SORTBY 2 @business ASC LIMIT ${offset} ${num}`)
    const optsAggregateBusiness = {
      LOAD: ['@pier', '@business'],
      STEPS: [
        {
          type: AggregateSteps.GROUPBY,
          properties: '@business',
          REDUCE: [{
            type: AggregateGroupByReducers.TOLIST,
            property: 'pier',
            AS: 'pier',
          }],
        },
        {
          type: AggregateSteps.SORTBY,
          BY: '@business',
          MAX: 1,
        },
        {
          type: AggregateSteps.LIMIT,
          from: offset,
          size: num,
        },
      ],
    }
    businesses = await redis.ft.aggregate('glp:idx:piers:business', '*', optsAggregateBusiness)
    log(businesses.total)
    log(businesses.results)
  } catch (e) {
    error('Failed to get list of businesses.')
    error(e.message)
    throw new Error('Redis query failed.', { cause: e })
  }
  if (ctx.state.isAsyncRequest === true) {
    ctx.status = 200
    ctx.type = 'application/json; charset=utf-8'
    ctx.body = businesses.results
  } else {
    const locals = {}
    locals.skipForward = skipForward
    locals.skipBack = skipBack
    locals.offset = offset
    locals.num = num
    locals.total = businesses.total
    locals.businesses = businesses.results
    locals.flash = ctx.flash.view ?? {}
    locals.title = `${ctx.app.site}: Businesses on Geneva Lake`
    locals.sessionUser = ctx.state.sessionUser
    locals.isAuthenticated = ctx.state.isAuthenticated
    await ctx.render('businesses', locals)
  }
})

router.get('poiRedirect', '/pois', async (ctx) => {
  ctx.status = 301
  ctx.redirect('/points-of-interest')
})

router.get('poiList', '/points-of-interest', hasFlash, addIpToSession, async (ctx) => {
  const log = glpLog.extend('GET-points-of-interest')
  const error = glpError.extend('GET-points-of-interest')
  if (ctx.state.isAsyncRequest === true) {
    log('Async query received.')
  }
  log(ctx.request.query.s)
  const x = 70
  const s = (ctx.request.query?.s !== undefined) ? Math.abs(parseInt(sanitize(ctx.request.query.s), 10)) : 1
  const num = 10
  const offset = (s <= 1) ? 0 : (s - 1) * num
  const skipback = (s <= 1) ? 0 : s - 1
  const skipforward = s + 1
  log(`s: ${s}, offset: ${offset} num: ${num.toString().padStart(2, '0')}, skipback: ${skipback} skipforward: ${skipforward}, remaining: ${x} - ${offset} = ${x - offset}`)
  let pois
  try {
    const idxPoiType = 'glp:idx:pois:type'
    const dialect = 2
    const optsPois = {
      SORTBY: {
        BY: 'id',
        DIRECTION: 'ASC',
      },
      LIMIT: { from: offset, size: num },
      RETURN: ['$'],
      DIALECT: dialect,
      PARAMS: {
        exclude: 'mileMarker',
      },
    }
    const queryPointsOfInterest = `-@type:(${optsPois.PARAMS.exclude})`
    const query = `ft.search ${idxPoiType} ${queryPointsOfInterest} `
      + `SORTBY id ASC LIMIT ${offset} ${num} DIALECT ${dialect}`
    log(query)
    pois = await redis.ft.search(idxPoiType, queryPointsOfInterest, optsPois)
    // pois = await redis.ft.search(idxPoiType, '-@type:($exclude)', optsPois)
    log(pois.documents[0])
  } catch (e) {
    error('Failed to get list of points-of-interest.')
    error(e.message)
    throw new Error('Redis points-of-interest query failed.', { cause: e })
  }
  if (ctx.state.isAsyncRequest === true) {
    ctx.status = 200
    ctx.type = 'application/json; charset=utf-8'
    ctx.body = pois.results
  } else {
    const locals = {}
    locals.s = s
    locals.offset = offset
    locals.skipForward = skipforward
    locals.skipBack = skipback
    locals.num = num
    locals.total = pois.total
    locals.pois = pois
    locals.flash = ctx.flash.view ?? {}
    locals.title = `${ctx.app.site}: Points of Interest on Geneva Lake`
    locals.sessionUser = ctx.state.sessionUser
    locals.isAuthenticated = ctx.state.isAuthenticated
    await ctx.render('pois', locals)
  }
})

router.get('poi', '/point-of-interest/:poi', hasFlash, addIpToSession, async (ctx) => {
  const log = glpLog.extend('GET-point-of-interest')
  // const error = glpError.extend('GET-point-of-interest')
  if (ctx.state.isAsyncRequest === true) {
    log('Async query received.')
  }
})

// move to src/router/edit.js
router.get('poiNew', '/poi/new', async (ctx) => {
  const log = glpLog.extend('GET-pioNew')
  const error = glpError.extend('GET-pioNew')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    const locals = {}
    locals.title = 'New Point of Interest'
    locals.flash = {}
    locals.pier = 0
    locals.pierNumber = 0
    await ctx.render('poi-new', locals)
  }
})

// move to src/router/edit.js
router.get('poiEdit', '/poi/edit/:poi', hasFlash, addIpToSession, async (ctx) => {
  const log = glpLog.extend('GET-pioEdit')
  const error = glpError.extend('GET-pioEdit')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    const locals = {}
    await ctx.render('poi-edit', locals)
  }
})

// move to src/router/edit.js
router.post('poiEdit', '/poi/edit/:poi', hasFlash, addIpToSession, processFormData, async (ctx) => {
  const log = glpLog.extend('POST-pioEdit')
  const error = glpError.extend('POST-pioEdit')
  if (!ctx.state?.isAuthenticated) {
    error('User is not authenticated.  Redirect to /')
    ctx.status = 401
    ctx.redirect('/')
  } else {
    const locals = {}
    await ctx.render('edit-poi', locals)
  }
})

router.get('walkingRedirect', '/walkingpath', async (ctx) => {
  ctx.status = 301
  ctx.redirect('/walking-path')
})

router.get('walkingPath', '/walking-path', hasFlash, addIpToSession, async (ctx) => {
  const log = glpLog.extend('GET-walking-path')
  const error = glpError.extend('GET-walking-path')
  if (ctx.state.isAsyncRequest === true) {
    log('Async query received.')
  }
  log('ctx.request.query.s', ctx.request.query.s)
  const x = 25
  const s = (ctx.request.query?.s !== undefined) ? Math.abs(parseInt(sanitize(ctx.request.query.s), 10)) : 1
  const num = 100
  const offset = 0
  const skipBack = (s <= 1) ? 0 : s - 1
  const skipForward = s + 1

  log(`s: ${s}, offset: ${offset} num: ${num.toString().padStart(2, '0')}, skipBack: ${skipBack} skipForward: ${skipForward}, remaining: ${x} - ${offset} = ${x - offset}`)
  let mileMarkers = []
  const locals = {}
  try {
    const idxMileMarkers = 'glp:idx:pois:type'
    const queryMileMarkers = '@type:"mileMarker"'
    const optsMileMarkers = {
      SORTBY: {
        BY: 'id',
        DIRECTION: 'ASC',
      },
      LIMIT: { from: offset, size: num },
      RETURN: ['$'],
    }
    const query = `ft.search ${idxMileMarkers} ${queryMileMarkers} `
      + `SORTBY id ASC LIMIT ${offset} ${num}`
    log(query)
    mileMarkers = await redis.ft.search(idxMileMarkers, queryMileMarkers, optsMileMarkers)
    log(mileMarkers?.total, mileMarkers?.documents)
  } catch (e) {
    error('Failed to get list of walking path pois.')
    error(e)
    throw new Error('Redis query failed retrieving walking path pois.', { cause: e })
  }
  locals.offset = offset
  locals.num = num
  locals.skipBack = skipBack
  locals.skipForward = skipForward
  locals.total = mileMarkers?.total
  locals.mileMarkers = mileMarkers?.documents
  locals.pois = []
  locals.flash = ctx.flash.view ?? {}
  locals.title = `${ctx.app.site}: Walking Path`
  locals.sessinUser = ctx.state.sessionUser
  locals.isAuthenticated = ctx.state.isAuthenticated
  await ctx.render('walking-path', locals)
})

router.get('pierMarinas', '/marinas', hasFlash, addIpToSession, async (ctx) => {
  const log = glpLog.extend('GET-piersMarinas')
  const error = glpError.extend('GET-piersMarinas')
  const offset = 0
  const num = 100
  let marinas
  try {
    log(`ft.AGGREGATE glp:idx:piers:marina "*" LOAD 6 $.pier AS pier $.property.business AS business GROUPBY 1 @business REDUCE TOLIST 1 @pier AS pier SORTBY 2 @business ASC LIMIT ${offset} ${num}`)
    const optsAggregateMarina = {
      LOAD: ['@pier', '@business', '@marina'],
      STEPS: [
        {
          type: AggregateSteps.GROUPBY,
          properties: '@business',
          REDUCE: [{
            type: AggregateGroupByReducers.TOLIST,
            property: 'pier',
            AS: 'pier',
          }],
        },
        {
          type: AggregateSteps.SORTBY,
          BY: '@business',
          MAX: 1,
        },
        {
          type: AggregateSteps.LIMIT,
          from: offset,
          size: num,
        },
      ],
    }
    marinas = await redis.ft.aggregate('glp:idx:piers:marina', '*', optsAggregateMarina)
    log(marinas.total)
    log(marinas.results)
  } catch (e) {
    error('Failed to get list of businesses.')
    error(e.message)
    throw new Error('Redis query failed.', { cause: e })
  }
  const locals = {}
  locals.offset = offset
  locals.num = num
  locals.total = marinas.total
  locals.marinas = marinas.results
  locals.flash = ctx.flash.view ?? {}
  locals.title = `${ctx.app.site}: Marinas on Geneva Lake`
  locals.sessionUser = ctx.state.sessionUser
  locals.isAuthenticated = ctx.state.isAuthenticated
  await ctx.render('marinas', locals)
})

router.get('Towns', '/towns', hasFlash, addIpToSession, async (ctx) => {
  const log = glpLog.extend('GET-Towns')
  // const error = glpError.extend('GET-Towns')
  const towns = {}
  towns.total = 5
  towns.results = [
    { t: 'city-of-lake-geneva', n: 'City of Lake Geneva' },
    { t: 'town-of-linn', n: 'Town of Linn' },
    { t: 'village-of-williams-bay', n: 'Village of Williams Bay' },
    { t: 'village_of_fontana-on-geneva_lake', n: 'Village of Fontana-on-Geneva Lake' },
    { t: 'town-of-walworth', n: 'Town of Walworth' },
  ]
  log(towns)
  const locals = {}
  locals.total = towns.total
  locals.towns = towns.results
  locals.flash = ctx.flash.view ?? {}
  locals.title = `${ctx.app.site}: Towns on Geneva Lake`
  locals.sessionUser = ctx.state.sessionUser
  locals.isAuthenticated = ctx.state.isAuthenticated
  await ctx.render('towns', locals)
})

router.get('pierFood', '/food', hasFlash, addIpToSession, async (ctx) => {
  const log = glpLog.extend('GET-piersFood')
  const error = glpError.extend('GET-piersFood')
  const offset = 0
  const num = 100
  let foods
  try {
    log(`ft.AGGREGATE glp:idx:piers:food "*" LOAD 6 $.pier AS pier $.property.business AS business GROUPBY 1 @business REDUCE TOLIST 1 @pier AS pier SORTBY 2 @business ASC LIMIT ${offset} ${num}`)
    const optsAggregateFood = {
      LOAD: ['@pier', '@business', '@food'],
      STEPS: [
        {
          type: AggregateSteps.GROUPBY,
          properties: '@business',
          REDUCE: [{
            type: AggregateGroupByReducers.TOLIST,
            property: 'pier',
            AS: 'pier',
          }],
        },
        {
          type: AggregateSteps.SORTBY,
          BY: '@business',
          MAX: 1,
        },
        {
          type: AggregateSteps.LIMIT,
          from: offset,
          size: num,
        },
      ],
    }
    foods = await redis.ft.aggregate('glp:idx:piers:food', '*', optsAggregateFood)
    log(foods.total)
    log(foods.results)
  } catch (e) {
    error('Failed to get list of restaurants.')
    error(e.message)
    throw new Error('Redis query failed.', { cause: e })
  }
  const locals = {}
  locals.offset = offset
  locals.num = num
  locals.total = foods.total
  locals.foods = foods.results
  locals.flash = ctx.flash.view ?? {}
  locals.title = `${ctx.app.site}: Restaurants with piers on Geneva Lake`
  locals.sessionUser = ctx.state.sessionUser
  locals.isAuthenticated = ctx.state.isAuthenticated
  await ctx.render('food', locals)
})

router.get('pierAssociations', '/associations', hasFlash, addIpToSession, async (ctx) => {
  const log = glpLog.extend('GET-piersAssociations')
  const error = glpError.extend('GET-piersAssociations')
  if (ctx.state.isAsyncrequest === true) {
    log('async query received.')
  }
  log(ctx.request.query.s)
  const x = 70
  const s = (ctx.request.query?.s !== undefined) ? Math.abs(parseInt(sanitize(ctx.request.query.s), 10)) : 1
  const num = 10
  const offset = (s <= 1) ? 0 : (s - 1) * num
  const skipback = (s <= 1) ? 0 : s - 1
  const skipforward = s + 1
  log(`s: ${s}, offset: ${offset} num: ${num.toString().padStart(2, '0')}, skipback: ${skipback} skipforward: ${skipforward}, remaining: ${x} - ${offset} = ${x - offset}`)
  let associations
  try {
    log(`ft.AGGREGATE glp:idx:piers:association "*" LOAD 3 $.pier AS pier GROUPBY 1 @association REDUCE COUNT_DISTINCT SORTBY 2 @association ASC LIMIT ${offset} ${num}`)
    const optsAggregateAssoc = {
      LOAD: ['@pier', '@association'],
      STEPS: [
        {
          type: AggregateSteps.GROUPBY,
          properties: '@association',
          REDUCE: [{
            type: AggregateGroupByReducers.COUNT_DISTINCT,
            property: 'association',
            AS: 'num_associations',
          }],
        },
        {
          type: AggregateSteps.SORTBY,
          BY: '@association',
          MAX: 1,
        },
        {
          type: AggregateSteps.LIMIT,
          from: offset,
          size: num,
        },
      ],
    }
    associations = await redis.ft.aggregate('glp:idx:piers:association', '*', optsAggregateAssoc)
    log(associations.total)
    log(associations.results)
  } catch (e) {
    error('Failed to get list of associations.')
    error(e.message)
    throw new Error('Redis query failed.', { cause: e })
  }
  if (ctx.state.isAsyncRequest === true) {
    ctx.status = 200
    ctx.type = 'application/json; charset=utf-8'
    ctx.body = associations.results
  } else {
    const locals = {}
    locals.s = s
    locals.offset = offset
    locals.skipForward = skipforward
    locals.skipBack = skipback
    locals.num = num
    locals.total = associations.total
    locals.associations = associations.results
    locals.flash = ctx.flash.view ?? {}
    locals.title = `${ctx.app.site}: Associations with piers on Geneva Lake`
    locals.sessionUser = ctx.state.sessionUser
    locals.isAuthenticated = ctx.state.isAuthenticated
    await ctx.render('associations', locals)
  }
})

router.get('piersByAssociation', '/assoc/:assoc', hasFlash, addIpToSession, async (ctx) => {
  const log = glpLog.extend('GET-piersByAssoc')
  const error = glpError.extend('GET-piersByAssoc')
  const assoc = sanitize(ctx.params.assoc)
  const decodedAssoc = decodeURI(assoc)
  log(assoc)
  log(decodedAssoc)
  const from = 0
  const size = 60
  let piersInAssoc
  const idxPierAssociation = 'glp:idx:piers:association'
  const queryPierAssociation = `@association:(${decodedAssoc})`
  const optsPierAssociation = {}
  optsPierAssociation.RETURN = ['pier', '$.loc', 'association']
  optsPierAssociation.LIMIT = { from, size }
  optsPierAssociation.SORTBY = { BY: 'pier', DIRECTION: 'ASC' }
  log(`Association piers FT.SEARCH ${idxPierAssociation} ${optsPierAssociation}`)
  log(`ft.search ${idxPierAssociation} "@association:(${decodedAssoc})" RETURN 3 pier $.loc association SORTBY pier asc`)
  try {
    piersInAssoc = await redis.ft.search(idxPierAssociation, queryPierAssociation, optsPierAssociation)
    log(piersInAssoc)
  } catch (e) {
    error('Failed to get list of associations.')
    error(e.message)
    throw new Error('Redis query failed.', { cause: e })
  }
  const locals = {}
  locals.associationName = decodedAssoc
  locals.total = piersInAssoc.total
  locals.association = piersInAssoc.documents
  locals.flash = ctx.flash.view ?? {}
  locals.title = `${ctx.app.site}: ${decodedAssoc}`
  locals.sessionUser = ctx.state.sessionUser
  locals.isAuthenticated = ctx.state.isAuthenticated
  locals.town = assoc.split('_').map((e) => e.toProperCase()).join(' ')
  await ctx.render('assoc', locals)
})

router.get('pierByNumber', '/pier/:pier', hasFlash, addIpToSession, async (ctx) => {
  const log = glpLog.extend('GET-pierByNumber')
  const error = glpError.extend('GET-pierByNumber')
  const pierNumber = sanitize(ctx.params.pier.toUpperCase())
  const zeroPaddedPierNumber = leftZeroPad(pierNumber)
  log(`pierNumber: ${pierNumber}, zeroPaddedPierNumber: ${zeroPaddedPierNumber}`)
  if (pierNumber !== zeroPaddedPierNumber) {
    ctx.status = 301
    ctx.redirect(`/pier/${zeroPaddedPierNumber}`)
    ctx.body = `Redirecting to ${ctx.origin}/pier/${zeroPaddedPierNumber}`
  } else {
    const locals = {}
    let key = `glp:piers:${pierNumber}`
    let pier
    let town
    log(pierNumber)
    log(ctx.state.structuredData)
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
      let leading0s = 0
      if (pier.pier[0] === '0') leading0s += 1
      if (pier.pier[1] === '0') leading0s += 1
      if (leading0s > 0) {
        // pier.strippedPier = pier.pier.slice(leading0s)
        pier.strippedPier = pier.pier.slice(leading0s)
      } else {
        pier.strippedPier = pier.pierNumber
      }
      log(`stipping leading 0's from pier number: ${pier.stippedPier}`)
      log(pier)
      log(`has hidden members? ${pier.pier}`)
      pier.owners.forEach((o, j) => {
        const filtered = []
        o.members.forEach((m) => {
          log(m)
          // if (m?.hidden === true) {
          if (m?.hidden === 1) {
            log(`member: ${m.f} ${m.l} is hidden ${m?.hidden}`)
          } else {
            filtered.push(m)
          }
        })
        pier.owners[j].members = filtered
      })
    } catch (e) {
      error(e)
      throw new Error(`Failed to get pier ${pierNumber}`, { cause: e })
    }
    let nextPier
    let previousPier
    key = 'glp:all_piers_in_order'
    try {
      nextPier = await redis.zRange(key, `[${pierNumber}`, '+', { BY: 'LEX', LIMIT: { offset: 1, count: 1 } })
      if (Number.isNaN(parseInt(nextPier, 10))) {
        nextPier = '001'
      }
      log(`next pier >> ${nextPier}`)
    } catch (e) {
      error(e)
      throw new Error(`Failed creating next pier link for pier ${pierNumber}`, { cause: e })
    }
    try {
      previousPier = await redis.zRange(key, `[${pierNumber}`, '-', { BY: 'LEX', REV: true, LIMIT: { offset: '1', count: '1' } })
      if (Number.isNaN(parseInt(previousPier, 10))) {
        previousPier = await redis.zRange(key, '0', '-1', { REV: true, BY: 'SCORE', LIMIT: { offset: '0', count: '1' } })
      }
      log(`prev pier >> ${previousPier}`)
    } catch (e) {
      error(e)
      throw new Error(`Failed creating previous pier link for pier ${pierNumber}`, { cause: e })
    }

    log(ctx.state.TOWNS)
    const [lon, lat] = pier.loc.split(',')
    const address = `${pier.property.address?.street}, ${pier.property.address?.city}, WI`
    locals.pageDescription = `Geneva Lake, pier ${pierNumber}, longitude: ${lon}, latitude: ${lat}, ${address}.`
    locals.pier = pier
    locals.town = town
    locals.photo = false
    locals.nextPier = nextPier
    locals.previousPier = previousPier
    locals.setTown = setTown
    locals.pierNumber = pierNumber
    locals.flash = ctx.flash.view ?? {}
    locals.title = `${ctx.app.site}: Pier ${pierNumber}`
    locals.sessionUser = ctx.state.sessionUser
    locals.isAuthenticated = ctx.state.isAuthenticated
    await ctx.render('pier', locals)
  }
})

router.get('pierEdit-GET', '/pier/edit/:pier', hasFlash, addIpToSession, async (ctx) => {
  const log = glpLog.extend('GET-pierEdit')
  const error = glpError.extend('GET-pierEdit')
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
    log(pierNumber)
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
    await ctx.render('pier-edit', locals)
  }
})

router.post('search', '/search', hasFlash, addIpToSession, processFormData, async (ctx) => {
  const log = glpLog.extend('search')
  const error = glpError.extend('search')
  const searchTerms = ctx.request.body.searchBox
  // log(searchTerms, ctx.request.body.searchBox)
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  if (!doTokensMatch(ctx)) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    ctx.status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    // let stopSearching = false
    const strings = []
    const numbers = []
    const results = {
      addresses: { total: 0 },
      pierNumbers: { total: 0 },
      estateNames: { total: 0 },
      ownerNames: { total: 0 },
    }
    searchTerms[0].split(' ').forEach((t) => {
      log(`split search term: ${t}`)
      if (!Number.isNaN(parseInt(t, 10))) {
        let padded = parseInt(t, 10) < 100 ? `0${t}` : t
        if (/\./.test(t)) {
          padded = padded.slice(0, -2)
        }
        log(`padded ${padded}`)
        numbers.push(`${padded}*`)
      } else {
        /* eslint-disable-next-line */
        if (t.length > 0) {
          strings.push(t)
        } else {
          console.log('empty string')
        }
      }
    })
    // Address check
    let idxPierAddress
    let queryPierAddress
    let optsPierAddress
    try {
      idxPierAddress = 'glp:idx:piers:address'
      queryPierAddress = `'${searchTerms[0]}'`
      optsPierAddress = {}
      // optsPierAddress.SORTBY = { BY: '$.pier', DIRECTION: 'ASC' }
      optsPierAddress.RETURN = ['$.pier', 'AS', 'pierNumber', '$.loc', 'AS', 'coords', '$.property.address.street', 'AS', 'address']
      log(`Pier address FT.SEARCH ${idxPierAddress} ${queryPierAddress}`)
      results.addresses = await redis.ft.search(idxPierAddress, queryPierAddress, optsPierAddress)
      log('address results: %O', results.addresses)
      // if (results.addresses.total > 0) {
      //   stopSearching = true
      // }
    } catch (e) {
      error('Redis address search query failed:')
      error(`using index: ${idxPierAddress}`)
      error(`query: FT.SEARCH ${idxPierAddress} "${queryPierAddress}"`, optsPierAddress)
      error(e)
      // No need to disrupt the rest of the searching if this query failed.
      // throw new Error('Search by pier numbers failed.', { cause: e })
    }
    // if (numbers.length > 0 && !stopSearching) {
    if (numbers.length > 0 && strings.length === 0) {
      log(`numbers: ${numbers}`)
      let idxPierNumber
      let queryPierNumber
      let optsPierNumber
      try {
        // Conduct seach by pier numbers.
        let pierNumberTokens = ''
        numbers.forEach((t, i) => {
          if (i === 0) pierNumberTokens += '('
          pierNumberTokens += `${t}`
          if (i < numbers.length - 1) pierNumberTokens += '|'
          if (i === numbers.length - 1) pierNumberTokens += ')'
        })
        log(`Pier number tokens: ${pierNumberTokens}`)
        idxPierNumber = 'glp:idx:piers:number'
        queryPierNumber = `@pierNumber:${pierNumberTokens}`
        optsPierNumber = {}
        optsPierNumber.SORTBY = { BY: 'pierNumber', DIRECTION: 'ASC' }
        // optsPierNumber.RETURN = 'pierNumber'
        optsPierNumber.RETURN = ['pierNumber', '$.loc', 'AS', 'coords']
        log(`Pier number FT.SEARCH ${idxPierNumber} ${queryPierNumber}`)
        results.pierNumbers = await redis.ft.search(idxPierNumber, queryPierNumber, optsPierNumber)
        log(results.pierNumbers)
      } catch (e) {
        error('Redis search query failed:')
        error(`using index: ${idxPierNumber}`)
        error(`query: FT.SEARCH ${idxPierNumber} "${queryPierNumber}"`, optsPierNumber)
        error(e)
        // No need to disrupt the rest of the searching if this query failed.
        // throw new Error('Search by pier numbers failed.', { cause: e })
      }
      // Need to use a better solution here
      results.public = { total: 0, documents: [] }
      results.food = { total: 0, documents: [] }
    } else {
      results.pierNumbers = { total: 0 }
    }
    if (strings.length > 0) {
      log(`strings: ${strings}`)
      if (/public|municip/i.test(strings)) {
        let idxPierPublic
        let queryPierPublic
        let optsPierPublic
        try {
          // Conduct search for public piers.
          let pierPublicTokens = ''
          if (strings.length === 1) {
            pierPublicTokens = `(${strings[0]})`
          } else {
            strings.forEach((t, i) => {
              if (i === 0) pierPublicTokens += '('
              pierPublicTokens += `${t}`
              if (i < strings.length - 1) pierPublicTokens += '|'
              if (i === strings.length - 1) pierPublicTokens += ')'
              log(pierPublicTokens)
            })
          }
          log(`Pier public tokens: ${pierPublicTokens}`)
          idxPierPublic = 'glp:idx:piers:public'
          queryPierPublic = '@public:[1 1]'
          optsPierPublic = {}
          optsPierPublic.SORTBY = { BY: 'pier', DIRECTION: 'ASC' }
          optsPierPublic.RETURN = ['pier', 'firstname', '$.loc', 'AS', 'coords']
          optsPierPublic.LIMIT = { from: 0, size: 20 }
          log(`Pier public FT.SEARCH ${idxPierPublic} "${queryPierPublic}"`)
          results.public = await redis.ft.search(idxPierPublic, queryPierPublic, optsPierPublic)
          log(results.public)
        } catch (e) {
          error('Redis search query failed:')
          error(`using index: ${idxPierPublic}`)
          error(`query: FT.SEARCH ${idxPierPublic} "${queryPierPublic}"`, optsPierPublic)
          error(e)
          // No need to disrupt the rest of the searching if this query failed.
          // throw new Error('Search by estate name failed.', { cause: e })
        }
      } else {
        results.public = { total: 0, documents: [] }
      }
      if (/food|eat|restaurant|grill|bar/i.test(strings)) {
        let idxPierFood
        let queryPierFood
        let optsPierFood
        try {
          // Conduct search for food piers.
          let pierFoodTokens = ''
          if (strings.length === 1) {
            pierFoodTokens = `(${strings[0]})`
          } else {
            strings.forEach((t, i) => {
              if (i === 0) pierFoodTokens += '('
              pierFoodTokens += `${t}`
              if (i < strings.length - 1) pierFoodTokens += '|'
              if (i === strings.length - 1) pierFoodTokens += ')'
              log(pierFoodTokens)
            })
          }
          log(`Pier food tokens: ${pierFoodTokens}`)
          idxPierFood = 'glp:idx:piers:food'
          queryPierFood = '@food:[1 1]'
          optsPierFood = {}
          optsPierFood.SORTBY = { BY: 'pier', DIRECTION: 'ASC' }
          optsPierFood.RETURN = ['pier', 'business', '$.loc', 'AS', 'coords']
          optsPierFood.LIMIT = { from: 0, size: 20 }
          log(`Pier food FT.SEARCH ${idxPierFood} "${queryPierFood}"`)
          results.food = await redis.ft.search(idxPierFood, queryPierFood, optsPierFood)
          log(results.food)
        } catch (e) {
          error('Redis search query failed:')
          error(`using index: ${idxPierFood}`)
          error(`query: FT.SEARCH ${idxPierFood} "${queryPierFood}"`, optsPierFood)
          error(e)
          // No need to disrupt the rest of the searching if this query failed.
          // throw new Error('Search by estate name failed.', { cause: e })
        }
      } else {
        results.food = { total: 0, documents: [] }
      }
      let idxPierEstateName
      let queryPierEstateName
      let optsPierEstateName
      try {
        // Conduct search by estate name.
        let pierEstatenameTokens = ''
        if (strings.length === 1) {
          pierEstatenameTokens = `(${strings[0]})`
        } else {
          strings.forEach((t, i) => {
            if (i === 0) pierEstatenameTokens += '('
            pierEstatenameTokens += `${t}`
            if (i < strings.length - 1) pierEstatenameTokens += '|'
            if (i === strings.length - 1) pierEstatenameTokens += ')'
            log(pierEstatenameTokens)
          })
        }
        log(`Pier estate name tokens: ${pierEstatenameTokens}`)
        idxPierEstateName = 'glp:idx:piers:estateName'
        queryPierEstateName = `@estateName:${pierEstatenameTokens}`
        optsPierEstateName = {}
        optsPierEstateName.SORTBY = { BY: 'pier', DIRECTION: 'ASC' }
        optsPierEstateName.RETURN = ['pier', 'estateName', '$.loc', 'AS', 'coords']
        optsPierEstateName.LIMIT = { from: 0, size: 20 }
        log(`Pier estate name FT.SEARCH ${idxPierEstateName} "${queryPierEstateName}"`)
        results.estateNames = await redis.ft.search(idxPierEstateName, queryPierEstateName, optsPierEstateName)
        log(results.estateNames)
      } catch (e) {
        error('Redis search query failed:')
        error(`using index: ${idxPierEstateName}`)
        error(`query: FT.SEARCH ${idxPierEstateName} "${queryPierEstateName}"`, optsPierEstateName)
        error(e)
        // No need to disrupt the rest of the searching if this query failed.
        // throw new Error('Search by estate name failed.', { cause: e })
      }
      let idxPierOwnerName
      let queryPierOwnerName
      let optsPierOwnerName
      try {
        // Conduct search by owner names.
        let pierOwnernameTokens = ''
        if (strings.length === 1) {
          pierOwnernameTokens = `(${strings[0]})`
        } else {
          strings.forEach((t, i) => {
            if (i === 0) pierOwnernameTokens += '('
            pierOwnernameTokens += `${t}`
            if (i < strings.length - 1) pierOwnernameTokens += '|'
            if (i === strings.length - 1) pierOwnernameTokens += ')'
            log(pierOwnernameTokens)
          })
        }
        log(`Pier owner name tokens: ${pierOwnernameTokens}`)
        idxPierOwnerName = 'glp:idx:piers:ownerNames'
        // queryPierOwnerName = `@fistname|lastname:${pierOwnernameTokens}`
        queryPierOwnerName = `@lastname|firstname:${pierOwnernameTokens} (-@business:${pierOwnernameTokens}) (-@association:${pierOwnernameTokens}) (-Assoc*)`
        optsPierOwnerName = {}
        optsPierOwnerName.SORTBY = { BY: 'pier', DIRECTION: 'ASC' }
        optsPierOwnerName.RETURN = ['pier', 'firstname', 'lastname', 'business', '$.loc', 'AS', 'coords']
        log(`Pier owner name FT.SEARCH ${idxPierOwnerName} "${queryPierOwnerName}"`)
        results.ownerNames = await redis.ft.search(idxPierOwnerName, queryPierOwnerName, optsPierOwnerName)
        log(results.ownerNames)
      } catch (e) {
        error('Redis search query failed:')
        error(`using index: ${idxPierOwnerName}`)
        error(`query: FT.SEARCH ${idxPierOwnerName} "${queryPierOwnerName}"`, optsPierOwnerName)
        error(e)
        // No need to disrupt the rest of the searching if this query failed.
        // throw new Error('Search by owner names failed.', { cause: e })
      }
      let queryPierAssociation
      let idxPierAssociation
      let optsPierAssociation
      try {
        // Conduct search by association names.
        let pierAssociationTokens = ''
        if (strings.length === 1) {
          pierAssociationTokens = `(${strings[0]})`
        } else {
          strings.forEach((t, i) => {
            if (i === 0) pierAssociationTokens += '('
            pierAssociationTokens += `${t}`
            if (i < strings.length - 1) pierAssociationTokens += '|'
            if (i === strings.length - 1) pierAssociationTokens += ')'
            log(pierAssociationTokens)
          })
        }
        log(`Pier association name tokens: ${pierAssociationTokens}`)
        idxPierAssociation = 'glp:idx:piers:association'
        queryPierAssociation = `@association:${pierAssociationTokens}`
        optsPierAssociation = {}
        optsPierAssociation.SORTBY = { BY: 'pier', DIRECTION: 'ASC' }
        optsPierAssociation.RETURN = ['pier', 'association', '$.loc', 'AS', 'coords']
        log(`Pier association name FT.SEARCH ${idxPierAssociation} "${queryPierAssociation}"`)
        results.associations = await redis.ft.search(idxPierAssociation, queryPierAssociation, optsPierAssociation)
        log(results.associations)
      } catch (e) {
        error('Redis search query failed:')
        error(`using index: ${idxPierAssociation}`)
        error(`query: FT.SEARCH ${idxPierAssociation} "${queryPierAssociation}"`, optsPierAssociation)
        error(e)
        // No need to disrupt the rest of the searching if this query failed.
        // throw new Error('Search by association name failed.', { cause: e })
      }
      let queryPierBusiness
      let idxPierBusiness
      let optsPierBusiness
      try {
        // Conduct search by business names.
        let pierBusinessTokens = ''
        if (strings.length === 1) {
          pierBusinessTokens = `(${strings[0]})`
        } else {
          strings.forEach((t, i) => {
            if (i === 0) pierBusinessTokens += '('
            pierBusinessTokens += `${t}`
            if (i < strings.length - 1) pierBusinessTokens += '|'
            if (i === strings.length - 1) pierBusinessTokens += ')'
            log(pierBusinessTokens)
          })
        }
        log(`Pier business name tokens: ${pierBusinessTokens}`)
        idxPierBusiness = 'glp:idx:piers:business'
        queryPierBusiness = `@business:${pierBusinessTokens}`
        optsPierBusiness = {}
        optsPierBusiness.SORTBY = { BY: 'pier', DIRECTION: 'ASC' }
        optsPierBusiness.RETURN = ['pier', 'business', '$.loc', 'AS', 'coords']
        log(`Pier business name FT.SEARCH ${idxPierBusiness} "${queryPierBusiness}"`)
        results.businesses = await redis.ft.search(idxPierBusiness, queryPierBusiness, optsPierBusiness)
        log(results.businesses)
      } catch (e) {
        error('Redis search query failed:')
        error(`using index: ${idxPierBusiness}`)
        error(`query: FT.SEARCH ${idxPierBusiness} "${queryPierBusiness}"`, optsPierBusiness)
        error(e)
        // No need to disrupt the rest of the searching if this query failed.
        // throw new Error('Search by business name failed.', { cause: e })
      }
    } else {
      results.estateNames = { total: 0 }
      results.ownerNames = { total: 0 }
      results.associations = { total: 0 }
      results.businesses = { total: 0 }
    }
    log(results)
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 200
    ctx.body = results
  }
})

router.get('galleries', '/galleries', hasFlash, addIpToSession, async (ctx) => {
  const log = glpLog.extend('galleries')
  const error = glpError.extend('galleries')
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

router.get('about', '/about', hasFlash, addIpToSession, async (ctx) => {
  const log = glpLog.extend('about')
  // const error = glpError.extend('about')
  log('inside index router: /about')
  ctx.status = 200
  await ctx.render('about', {
    body: ctx.body,
    title: `${ctx.app.site}: About`,
    sessionUser: ctx.state.sessionUser,
    isAuthenticated: ctx.state.isAuthenticated,
  })
})

router.get('contact', '/contact', hasFlash, addIpToSession, async (ctx) => {
  const log = glpLog.extend('contact')
  // const error = glpError.extend('contact')
  log('inside index router: /contact')
  ctx.status = 200
  await ctx.render('contact', {
    title: `${ctx.app.site}: Contact`,
    sessionUser: ctx.state.sessionUser,
    isAuthenticated: ctx.state.isAuthenticated,
  })
})

router.get('renderTest', '/renderTest', async (ctx) => {
  const log = glpLog.extend('renderTest')
  const rendered = await ctx.render('renderTest', {
    title: `${ctx.app.site}: render test`,
    user: ctx.state?.user ?? 'Matt',
    sessionUser: ctx.state?.sessionUser ?? {},
    isAuthenticated: false,
  })
  log(rendered)
  ctx.redirect('/')
})

export { router as glp }
