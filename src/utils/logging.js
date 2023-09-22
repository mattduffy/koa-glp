/**
 * @summary A small wrapper around the Debug package to setup the namespace.
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/utils/logging.js A small wrapper around the Debug package to setup the namespace.
 */

import Debug from 'debug'

Debug.log = console.log.bind(console)
const _log = Debug('koa-glp-LOG')
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
  // 'town_of_fontana',
  'village_of_fontana-on-Lake_geneva',
  'town_of_walworth',
]

/*
 * Convert URL parameter :town to redis set name.
 */
function getSetName(t = '') {
  let setName
  const town = t.toLowerCase().replace(/-/g, ' ')
  _log(town)
  switch (town) {
    case town.match(/lake genava/)?.input:
      [setName] = TOWNS
      break
    case town.match(/linn/)?.input:
      [, setName] = TOWNS
      break
    case town.match(/williams bay/)?.input:
      [, , setName] = TOWNS
      break
    case town.match(/fontana/)?.input:
      [, , , setName] = TOWNS
      break
    case town.match(/walworth/)?.input:
      [, , , , setName] = TOWNS
      break
    default:
      _log('no match found');
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
  _error,
  TOWNS,
  getSetName,
  capitalize,
}
