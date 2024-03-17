/**
 * @module @mattduffy/exif-inspector
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/utils/geoip.js A simple middleware to expose Maxmind GeoIP databases.
 */

import * as dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Reader } from '@maxmind/geoip2-node'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.resolve(`${__dirname}/../..`)
// console.log(`geoip appRoot: ${appRoot}`)
const geoEnv = {}
const showDebug = process.env.NODE_ENV !== 'production'
dotenv.config({ path: path.resolve(appRoot, 'config/geoip.env'), processEnv: geoEnv, debug: showDebug })
// console.log('GeoIP database locations: %o', geoEnv)

export const geoIPCity = await Reader.open(geoEnv.GEOIP_CITY_MMDB)
export const geoIPCountry = await Reader.open(geoEnv.GEOIP_COUNTRY_MMDB)
export const geoIPASN = await Reader.open(geoEnv.GEOIP_ASN_MMDB)
