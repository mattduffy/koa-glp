/**
 * @summary App model.
 * @exports @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file ./src/models/app.js
 */

import path from 'node:path'
import { stat, readFile, writeFile, mkdir } from 'node:fs/promises'
import { CryptoKeys } from './cryptoKeys.js'
import { _log, _error } from '../utils/logging.js'

const appLog = _log.extend('App_class')
const appError = _error.extend('App_class')
const DATABASE = process.env.MONGODB_DBNAME ?? 'koastub'
const COLLECTION = 'app'

class App {
  #cryptoKeys

  #sigPubKeyPath

  #sigPriKeyPath

  #sigJWKKeyPath

  #encPubKeyPath

  #encPriKeyPath

  #encJWKKeyPath

  constructor(config = {}) {
    const log = appLog.extend('constructor')
    const error = appError.extend('constructor')

    this._keyDir = config.keyDir ?? './keys'
    this._db = config?.db.db().collection(COLLECTION)
    this._siteName = process.env.SITE_NAME ?? 'website'
    this._keys = config.keys ?? { signing: [], encrypting: [] }
    this.#cryptoKeys = new CryptoKeys({ dirs: { public: this._keyDir, private: this._keyDir } })
  }

  async keys() {
    const log = appLog.extend('keys')
    const error = appError.extend('keys')
    this._keys = (await this._db.findOne({ name: this._siteName }, { projection: { keys: 1 } }))?.keys
    let needToUpdate = false
    const numSigKeys = this._keys.signing?.length ?? 0
    const numEncKeys = this._keys.encrypting?.length ?? 0
    // log(this._keys, numSigKeys, numEncKeys)
    try {
      if (numSigKeys < 1) {
        // await this.#createRSASigningKey()
        this.#cryptoKeys = await this.#cryptoKeys.generateKey({ alg: 'RSA', use: 'sig' })
        needToUpdate = true
      }
      if (numEncKeys < 1) {
        // await this.#createRSAEncryptingKey()
        this.#cryptoKeys = await this.#cryptoKeys.generateKey({ alg: 'RSA', use: 'enc' })
        needToUpdate = true
      }
    } catch (e) {
      error('Failed to create crypto keys.')
      error(e)
      return false
    }
    if (needToUpdate) {
      const keyResults = await this.#cryptoKeys.export()
      if (keyResults.details.signing !== null) {
        // set filename and path for keys
        // save keys to file system
        const keyIndex = numSigKeys
        const filename = `app-${keyIndex}-${process.env.RSA_SIG_KEY_FILENAME}`
        const pubKeyPath = path.resolve(this._keyDir, `${filename}-public.pem`)
        const jwkeyPath = path.resolve(this._keyDir, `${filename}.jwk`)
        const priKeyPath = path.resolve(this._keyDir, `${filename}-private.pem`)
        try {
          await writeFile(pubKeyPath, keyResults.sig.public)
          keyResults.details.signing.publicKey = pubKeyPath
          log(`Saving ${pubKeyPath}`)
          await writeFile(priKeyPath, keyResults.sig.private)
          keyResults.details.signing.privateKey = priKeyPath
          log(`Saving ${priKeyPath}`)
          await writeFile(jwkeyPath, JSON.stringify(keyResults.sig.jwk))
          keyResults.details.signing.jwk = jwkeyPath
          log(`Saving ${jwkeyPath}`)
        } catch (e) {
          error('Failed to save key files.')
          error(e)
          throw new Error(e)
        }
        this._keys.signing.unshift(keyResults.details.signing)
      }
      if (keyResults.details.encrypting !== null) {
        // set filename and path for keys
        // save keys to file system
        const keyIndex = numEncKeys
        const filename = `app-${keyIndex}-${process.env.RSA_ENC_KEY_FILENAME}`
        const pubKeyPath = path.resolve(this._keyDir, `${filename}-public.pem`)
        const jwkeyPath = path.resolve(this._keyDir, `${filename}.jwk`)
        const priKeyPath = path.resolve(this._keyDir, `${filename}-private.pem`)
        try {
          await writeFile(pubKeyPath, keyResults.enc.public)
          keyResults.details.encrypting.publicKey = pubKeyPath
          log(`Saving ${pubKeyPath}`)
          await writeFile(priKeyPath, keyResults.enc.private)
          keyResults.details.encrypting.privateKey = priKeyPath
          log(`Saving ${priKeyPath}`)
          await writeFile(jwkeyPath, JSON.stringify(keyResults.enc.jwk))
          keyResults.details.encrypting.jwk = jwkeyPath
          log(`Saving ${jwkeyPath}`)
        } catch (e) {
          error('Failed to save key files.')
          error(e)
          throw new Error(e)
        }
        this._keys.encrypting.unshift(keyResults.details.encrypting)
      }
      // log('keys: ', this._keys)
      const filter = { name: this._siteName }
      const update = {
        $set: {
          keys: this._keys,
        },
      }
      const options = { writeConcern: { w: 'majority' }, upsert: false, returnDocument: 'after' }
      try {
        const result = await this._db.findOneAndUpdate(filter, update, options)
        if (result.ok !== 1) {
          throw new Error('Updating keys property failed.')
        }
        // log(result)
      } catch (e) {
        error('Failed to update db after creating new keys.')
        error(e)
        return false
      }
    }
    this.#sigPubKeyPath = this._keys.signing[0].publicKey
    this.#sigPriKeyPath = this._keys.signing[0].privateKey
    this.#sigJWKKeyPath = this._keys.signing[0].jwk
    this.#encPubKeyPath = this._keys.encrypting[0].publicKey
    this.#encPriKeyPath = this._keys.encrypting[0].privateKey
    this.#encJWKKeyPath = this._keys.encrypting[0].jwk
    return this._keys
  }

  /**
   * Rotate a new RSA key pair into use.
   * @summary Rotate a new RSA key pair into use.
   * @async
   * @return { undefined }
   */
  async rotate() {
    const log = appLog.extend('rotate')
    const error = appLog.extend('rotate')
    log('Rotating server keys.')
  }

  get signingPublicKey() {
    return this.#openKey(this.#sigPubKeyPath)
  }

  get signingPrivateKey() {
    return this.#openKey(this.#sigPriKeyPath)
  }

  get signingJwkPP() {
    return this.#prettyPrintJwk(this.#sigJWKKeyPath, true)
  }

  get signingJwk() {
    console.log(this.#sigJWKKeyPath)
    return this.#openKey(this.#sigJWKKeyPath)
  }

  get encryptingPublicKey() {
    return this.#openKey(this.#encPubKeyPath)
  }

  get encryptinPrivateKey() {
    return this.#openKey(this.#encPriKeyPath)
  }

  get encryptingJwkPP() {
    return this.#prettyPrintJwk(this.#encJWKKeyPath, true)
  }

  get encryptingJwk() {
    return this.#openKey(this.#encJWKKeyPath)
  }

  async #prettyPrintJwk(j, open = false) {
    let jwk = j
    if (open) {
      jwk = (await this.#openKey(j)).toString()
    }
    // const matches = jwk.match(/(?<key_ops>"key_ops":\[.*\]),(?<ext>"ext":(?:true|false)),(?<kty>"kty":"(?:RSA|AES|ECDSA|HMAC)"),(?<n>"n":"(?<n_val>.*)"),(?<e>"e":".*"),(?<alg>"alg":".*"),(?<kid>"kid":".*"),?(?<use>"use":".*")?/).groups
    const matches = jwk.match(/"key_ops":(?<key_ops>\[.*\]),"ext":(?<ext>(true|false)),"kty":(?<kty>".*"),"n":(?<n>".*"),"e":(?<e>".*"),"alg":(?<alg>".*"),"kid":(?<kid>".*"(?=,)),?(?:"use":(?<use>".*"))?/)
    const groups = matches?.groups
    const indent = '  '
    const string = '{\n'
      + `${indent}"key_ops": ${groups.key_ops},\n`
      // + `${indent}"ext": ${groups.ext},\n`
      + `${indent}"kty": ${groups.kty},\n`
      // + `${indent}"n":"${groups.n_val.match(/.{1,64}/g).join(`\n${indent}`)}",\n`
      + `${indent}"n": ${groups.n.match(/.{1,64}/g).join(`\n${indent}`)},\n`
      + `${indent}"e": ${groups.e},\n`
      + `${indent}"alg": ${groups.alg}\n`
      + `${indent}"kid": ${groups.kid},\n`
      + `${indent}"use": ${groups.use}\n`
      + '}'
    return string
  }

  async jwksjson(keyIndex = 0) {
    console.log((keyIndex).toString().match(/\d/))
    if ((keyIndex).toString()?.match(/(?<all>all)/i)?.groups?.all === 'all') {
      return { keys: 'All keys not functional yet.' }
    }
    const jwks = { keys: [] }
    try {
      const sig = JSON.parse(await this.signingJwk)
      if (sig) {
        jwks.keys.push(sig)
      }
    } catch (e) {
      console.error(e)
      throw new Error(e)
    }
    try {
      const enc = JSON.parse(await this.encryptingJwk)
      if (enc) {
        jwks.keys.push(enc)
      }
    } catch (e) {
      throw new Error(e)
    }
    return jwks
  }

  async #openKey(keyPath) {
    if (!keyPath) {
      throw new Error('Missing required path to key file.')
    }
    try {
      return await readFile(keyPath)
    } catch (e) {
      throw new Error(e)
    }
  }

}

export {
  App,
}
