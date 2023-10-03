/**
 * @summary Koa router for the main top-level pages.
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/routes/main.js The router for the top level app URLs.
 */

import Router from '@koa/router'
import { ulid } from 'ulid'
import formidable from 'formidable'
import { Albums } from '@mattduffy/albums/Albums' // eslint-disable-line import/no-unresolved
import { AggregateGroupByReducers, AggregateSteps } from 'redis'
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

router.get('index', '/', hasFlash, async (ctx) => {
  const log = mainLog.extend('index')
  // const error = mainError.extend('index')
  log('inside main router: /')
  ctx.status = 200
  log(`sessionUser.isAuthenticated: ${ctx.state.isAuthenticated}`)
  const csrfToken = ulid()
  ctx.session.csrfToken = csrfToken
  ctx.cookies.set('csrfToken', csrfToken, { httpOnly: true, sameSite: 'strict' })
  await ctx.render('index', {
    csrfToken,
    body: ctx.body,
    flash: ctx.flash?.index ?? {},
    title: `${ctx.app.site}: Home`,
    sessionUser: ctx.state.sessionUser,
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

router.get('pierAssociations', '/associations', hasFlash, async (ctx) => {
  const log = mainLog.extend('GET-piersAssociations')
  const error = mainError.extend('GET-piersAssociations')

  let associations
  try {
    // ft.AGGREGATE glp:idx:piers:association "*" LOAD 3 $.pier AS pier GROUPBY 1 @association SORTBY 2 @association ASC LIMIT 0 550
    const optsAggregateAssoc = {
      LOAD: ['@pier', '@association'],
      STEPS: [
        {
          type: AggregateSteps.GROUPBY,
          // property: 'association',
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
          from: 0,
          size: 100,
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
  const locals = {}
  locals.associations = associations.results
  locals.photo = false
  locals.flash = ctx.flash.view ?? {}
  locals.title = `${ctx.app.site}: Associations`
  locals.sessionUser = ctx.state.sessionUser
  locals.isAuthenticated = ctx.state.isAuthenticated
  await ctx.render('associations', locals)
})

router.get('piersByAssociation', '/assoc/:assoc', hasFlash, async (ctx) => {
  const log = mainLog.extend('GET-piersByAssoc')
  const error = mainError.extend('GET-piersByAssoc')
  const assoc = getSetName(sanitize(ctx.params.assoc))
  log(assoc)
  let piersInTown
  const key = `glp:piers_by_town:${assoc}`
  log(`key: ${key}`)
  try {
    piersInTown = await redis.zRange(key, 0, -1)
  } catch (e) {
    error(e)
    ctx.throw(500, 'Error', { assoc })
  }
  const locals = {}
  locals.piers = piersInTown
  locals.flash = ctx.flash.view ?? {}
  locals.title = `${ctx.app.site}: ${assoc}`
  locals.sessionUser = ctx.state.sessionUser
  locals.isAuthenticated = ctx.state.isAuthenticated
  locals.town = assoc.split('_').map((e) => e.toProperCase()).join(' ')
  await ctx.render('town', locals)
})

router.get('pierByNumber', '/pier/:pier', hasFlash, async (ctx) => {
  const log = mainLog.extend('GET-pierByNumber')
  const error = mainError.extend('GET-pierByNumber')
  const pierNumber = sanitize(ctx.params.pier)
  const locals = {}
  let key = `glp:piers:${pierNumber}`
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
    // const args = [key, '[643', '+', 'bylex', 'limit', '1', '1']
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
})

router.get('pierEdit-GET', '/pier/edit/:pier', hasFlash, async (ctx) => {
  const log = mainLog.extend('GET-pierEdit')
  const error = mainError.extend('GET-pierEdit')
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
    await ctx.render('edit-pier', locals)
  }
})

router.post('search', '/search', hasFlash, async (ctx) => {
  const log = mainLog.extend('search')
  const error = mainError.extend('search')
  const form = formidable({
    encoding: 'utf-8',
    // type: 'urlencoded',
    multipart: true,
  })
  form.type = 'urlencoded'
  await new Promise((resolve, reject) => {
    form.parse(ctx.req, (err, fields) => {
      if (err) {
        error('There was a problem parsing the multipart form data.')
        error(err)
        reject(err)
        return
      }
      log('Multipart form data was successfully parsed.')
      ctx.request.body = fields
      log(fields)
      resolve()
    })
  })
  const searchTerms = ctx.request.body.searchBox
  // log(searchTerms, ctx.request.body.searchBox)
  const csrfTokenCookie = ctx.cookies.get('csrfToken')
  const csrfTokenSession = ctx.session.csrfToken
  const { csrfTokenHidden } = ctx.request.body
  if (csrfTokenCookie === csrfTokenSession && csrfTokenSession === csrfTokenHidden) {
    error(`CSR-Token mismatch: header:${csrfTokenCookie} - session:${csrfTokenSession}`)
    ctx.status = 401
    ctx.body = { error: 'csrf token mismatch' }
  } else {
    const strings = []
    const numbers = []
    const results = {
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
    if (numbers.length > 0) {
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
        optsPierNumber.RETURN = 'pierNumber'
        log(`Pier number FT.SEARCH ${idxPierNumber} ${queryPierNumber}`)
        results.pierNumbers = await redis.ft.search(idxPierNumber, queryPierNumber, optsPierNumber)
        log(results.pierNumbers)
      } catch (e) {
        error('Redis search query feiled:')
        error(`using index: ${idxPierNumber}`)
        error(`query: FT.SEARCH ${idxPierNumber} "${queryPierNumber}"`, optsPierNumber)
        error(e)
        // No need to disrupt the rest of the searching if this query failed.
        // throw new Error('Search by pier numbers failed.', { cause: e })
      }
    }
    if (strings.length > 0) {
      log(`strings: ${strings}`)
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
        optsPierEstateName.RETURN = ['pier', 'estateName']
        optsPierEstateName.LIMIT = { from: 0, size: 20 }
        log(`Pier estate name FT.SEARCH ${idxPierEstateName} "${queryPierEstateName}"`)
        results.estateNames = await redis.ft.search(idxPierEstateName, queryPierEstateName, optsPierEstateName)
        log(results.estateNames)
      } catch (e) {
        error('Redis search query feiled:')
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
        queryPierOwnerName = `@lastname|firstname:${pierOwnernameTokens}`
        optsPierOwnerName = {}
        optsPierOwnerName.SORTBY = { BY: 'pier', DIRECTION: 'ASC' }
        optsPierOwnerName.RETURN = ['pier', 'firstname', 'lastname']
        log(`Pier owner name FT.SEARCH ${idxPierOwnerName} "${queryPierOwnerName}"`)
        results.ownerNames = await redis.ft.search(idxPierOwnerName, queryPierOwnerName, optsPierOwnerName)
        log(results.ownerNames)
      } catch (e) {
        error('Redis search query feiled:')
        error(`using index: ${idxPierOwnerName}`)
        error(`query: FT.SEARCH ${idxPierOwnerName} "${queryPierOwnerName}"`, optsPierOwnerName)
        error(e)
        // No need to disrupt the rest of the searching if this query failed.
        // throw new Error('Search by estate name failed.', { cause: e })
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
        optsPierAssociation.RETURN = ['pier', 'association']
        log(`Pier association name FT.SEARCH ${idxPierAssociation} "${queryPierAssociation}"`)
        results.associations = await redis.ft.search(idxPierAssociation, queryPierAssociation, optsPierAssociation)
        log(results.associations)
      } catch (e) {
        error('Redis search query feiled:')
        error(`using index: ${idxPierAssociation}`)
        error(`query: FT.SEARCH ${idxPierAssociation} "${queryPierAssociation}"`, optsPierAssociation)
        error(e)
        // No need to disrupt the rest of the searching if this query failed.
        // throw new Error('Search by owner names failed.', { cause: e })
      }
    } else {
      results.estateNames = { total: 0 }
      results.associations = { total: 0 }
      results.ownerNames = { total: 0 }
      results.pieNumbers = { total: 0 }
    }
    log(results)
    ctx.type = 'application/json; charset=utf-8'
    ctx.status = 200
    ctx.body = results
  }
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
