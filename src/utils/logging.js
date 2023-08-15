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

export {
  _log,
  _error,
}
