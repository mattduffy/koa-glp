/**
 * @summary A small wrapper around the Debug package to setup the namespace.
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/utils/logging.js A small wrapper around the Debug package to setup the namespace.
 */

import Debug from 'debug'

Debug.log = console.log.bind(console)
const _log = Debug('koa-glp-LOG')
const _info = Debug('koa-glp-INFO')
const _error = Debug('koa-glp-ERROR')

/* eslint-disable no-extend-native */
/* eslint-disable-next-line func-names */
String.prototype.toProperCase = function () {
  return this.replace(/\w*/, (x) => x.charAt(0).toUpperCase() + x.substr(1).toLowerCase())
}
/* eslint-enable no-extend-native */

const TOWNS = [
  'city_of_lake_geneva',
  'town_of_linn',
  'village_of_williams_bay',
  'village_of_fontana-on-Lake_geneva',
  'town_of_walworth',
]

/*
 * Convert a setTown identifier to a data directory name.
 */
function getTownDirName(t, p) {
  const log = _log.extend('getTownDirName')
  const error = _error.extend('getTownDirName')
  const town = t.toLowerCase()
  let dir
  switch (town) {
    case town.match(/city_of_lake_geneva/)?.inupt:
      dir = `${(parseFloat(p) <= 39) ? '1' : '7'}_${town}`
      break
    case town.match(/linn/)?.input:
      dir = `${(parseFloat(p) <= 167) ? '2' : '6'}_${town}`
      break
    case town.match(/williams/)?.input:
      dir = `3_${town}`
      break
    case town.match(/walworth/)?.input:
      dir = `4_${town}`
      break
    case town.match(/fontana/)?.input:
      dir = `5_${town}`
      break
    default:
      error('no match found.')
  }
  log(dir)
  return dir
}

/*
 * Convert URL parameter :town to redis set name.
 */
function getSetName(t = '') {
  const log = _log.extend('getSetName')
  const error = _error.extend('getSetName')
  let setName
  const town = t.toLowerCase().replace(/-/g, ' ')
  log(town)
  switch (town) {
    case town.match(/lake.geneva/)?.input:
      [setName] = TOWNS
      break
    case town.match(/linn/)?.input:
      [, setName] = TOWNS
      break
    case town.match(/williams.bay/)?.input:
      [, , setName] = TOWNS
      break
    case town.match(/fontana/)?.input:
      [, , , setName] = TOWNS
      break
    case town.match(/walworth/)?.input:
      [, , , , setName] = TOWNS
      break
    default:
      error('no match found');
      [setName] = TOWNS
  }
  return setName
}

/*
 * Capitalize a word
 */
function capitalize(word) {
  return word[0].toUpperCase() + word.substring(1).toLowerCase()
}

export {
  _log,
  _info,
  _error,
  TOWNS,
  getSetName,
  capitalize,
  getTownDirName,
}
