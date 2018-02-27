import * as _ from 'lodash';
import * as util from 'util';
import { PayPro } from './paypro';
import { Verifier } from './verifier';
import { Common } from './common';
import { Logger } from "./log";
import { Credentials } from './credentials';
import { MWCErrors } from './errors';
import * as preconditions from 'preconditions';
import * as EventEmitter from 'eventemitter3';
import * as Bitcore from 'bitcore-lib';
import * as Mnemonic from 'bitcore-mnemonic';
import * as querystring from 'querystring';
import * as Bip38 from 'bip38';
import * as request from 'superagent';

const $ = preconditions.singleton();
const { Constants, Utils } = Common;

const Package = require('../../../package.json');

const DEFAULT_FEE = 10000;

import { ENV } from '@app/env';
import { EasySend } from '../../models/easy-send';
import { EasyReceiptResult } from '../../models/easy-receipt';

/**
 * Merit Wallet Client; (re-)written in typescript.
 * TODO:
 *
 */

export interface InitOptions {
  request?: any;
  baseUrl?: string;
  payProHttp?: string;
  doNotVerifyPayPro?: boolean;
  timeout?: number;
  logLevel?: string;
}

export class API {
  public BASE_URL = 'https://stage.mws.merit.me/bws/api';
  public request: any;
  public baseUrl: string;
  public payProHttp: string;
  public doNotVerifyPayPro: boolean;
  public timeout: number;
  public logLevel: string;
  public privateKeyEncryptionOpts: any = {
    iter: 10000
  };
  public credentials: Credentials; // TODO: Make public with getters/setters
  public notificationIncludeOwn: boolean;
  public log: any;
  public lastNotificationId: string;
  public notificationsIntervalId: any;
  public keyDerivationOk: boolean;
  public session: any;
  public DEBUG_MODE: boolean = false;

  // Mutated from other services (namely wallet.service and profile.service)
  public id: string; // TODO: Re-evaluate where this belongs.
  public completeHistory: any; // This is mutated from Wallet.Service.ts; for now.
  public cachedStatus: any;
  public cachedActivity: any;
  public cachedTxps: any;
  public pendingTxps: any;
  public totalBalanceMicros: number;
  public scanning: boolean;
  public hasUnsafeConfirmed: boolean;
  public network: string;
  public n: number;
  public m: number;
  public notAuthorized: boolean;
  public needsBackup: boolean;
  public name: string;
  public color: string;
  public started: boolean;
  public copayerId: string;
  public unlocked: boolean;
  public confirmed: boolean;
  public parentAddress: string;
  public balanceHidden: boolean;
  public eventEmitter: any;
  public status: any;
  public secret: string;
  public email: string;
  public cachedBalance: string;
  public cachedBalanceUpdatedOn: string;
  public totalNetworkValue: string;
  public displayAddress: string;
  public miningRewards: string;
  public ambassadorRewards: string;
  public onConnectionError: any;
  public onAuthenticationError: any;
  public onConnectionRestored: any;

  private _rootAddress: string;

  constructor(opts: InitOptions) {
    this.eventEmitter = new EventEmitter.EventEmitter();
    this.request = opts.request || request;
    this.baseUrl = opts.baseUrl || this.BASE_URL;
    this.payProHttp = null; // Only for testing
    this.doNotVerifyPayPro = opts.doNotVerifyPayPro;
    this.timeout = opts.timeout || 50000;
    this.logLevel = opts.logLevel || 'debug';
    this.log = Logger.getInstance();
    this.log.setLevel(this.logLevel);
    this.log.info("Hello Merit Wallet Client!");
  }


  // Do we need an initialize now?  Constructor should be able to handle.
  initialize(opts): Promise<any> {
    return new Promise((resolve, reject) => {
      $.checkState(this.credentials);
      this.notificationIncludeOwn = !!opts.notificationIncludeOwn;
      //this._initNotifications(opts);
      return resolve();
    });
  };

  dispose(): any {
    this._disposeNotifications();
    this._logout();
  };

  setOnConnectionError(cb: any) {
    this.onConnectionError = cb;
  }

  setOnAuthenticationError(cb: any) {
    this.onAuthenticationError = cb;
  }

  setOnConnectionRestored(cb: any) {
    this.onConnectionRestored = cb;
  }

  _fetchLatestNotifications(interval): Promise<any> {
    this.log.info("_fetchLatestNotifications called.");
    let opts: any = {
      lastNotificationId: this.lastNotificationId,
      includeOwn: this.notificationIncludeOwn,
    };

    if (!this.lastNotificationId) {
      opts.timeSpan = interval + 1;
    }

    return this.getNotifications(opts).then((notifications: any) => {
      if (notifications && notifications.length > 0) {
        this.lastNotificationId = (_.last(notifications) as any).id;
      }

      return Promise.all(notifications.map(async (notification) => {
          this.eventEmitter.emit('notification', notification);
      }));
    });

  }

  _initNotifications(opts: any = {}): any {
    const interval = opts.notificationIntervalSeconds || 10; // TODO: Be able to turn this off during development mode; pollutes request stream..
    this.notificationsIntervalId = setInterval(() => {
      this._fetchLatestNotifications(interval).then(() => {
        this.log.warn("Init Notifications done");
      }).catch((err) => {
        if (err) {
          if (err == MWCErrors.NOT_FOUND || err == MWCErrors.NOT_AUTHORIZED) {
            this._disposeNotifications();
          }
        }
      });
    }, interval * 1000);
  };

  _disposeNotifications(): void {
    if (this.notificationsIntervalId) {
      clearInterval(this.notificationsIntervalId);
      this.notificationsIntervalId = null;
    }
  };


  /**
   * Reset notification polling with new interval
   * @param {Numeric} notificationIntervalSeconds - use 0 to pause notifications
   */
  setNotificationsInterval(notificationIntervalSeconds): any {
    this._disposeNotifications();
    if (notificationIntervalSeconds > 0) {
      this._initNotifications({
        notificationIntervalSeconds: notificationIntervalSeconds
      });
    }
  };


  /**
   * Encrypt a message
   * @private
   * @static
   * @memberof Client.API
   * @param {String} message
   * @param {String} encryptingKey
   */
  private _encryptMessage(message, encryptingKey) {
    if (!message) return null;
    return Utils.encryptMessage(message, encryptingKey);
  };

  /**
   * Decrypt a message
   * @private
   * @static
   * @memberof Client.API
   * @param {String} message
   * @param {String} encryptingKey
   */
  private _decryptMessage(message, encryptingKey) {
    if (!message) return '';
    try {
      return Utils.decryptMessage(message, encryptingKey);
    } catch (ex) {
      return '<ECANNOTDECRYPT>';
    }
  };

  _processTxNotes(notes): void {
    if (!notes) return;
    let encryptingKey = this.credentials.sharedEncryptingKey;
    _.each([].concat(notes), (note) => {
      note.encryptedBody = note.body;
      note.body = this._decryptMessage(note.body, encryptingKey);
      note.encryptedEditedByName = note.editedByName;
      note.editedByName = this._decryptMessage(note.editedByName, encryptingKey);
    });
  };

  /**
   * Decrypt text fields in transaction proposals
   * @private
   * @static
   * @memberof Client.API
   * @param {Array} txps
   * @param {String} encryptingKey
   */
  _processTxps(txps): Promise<void> {
    return new Promise((resolve, reject) => {

      if (!txps) return resolve();

      let encryptingKey = this.credentials.sharedEncryptingKey;
      _.each([].concat(txps), (txp) => {
        txp.encryptedMessage = txp.message;
        txp.message = this._decryptMessage(txp.message, encryptingKey) || null;
        txp.creatorName = this._decryptMessage(txp.creatorName, encryptingKey);

        _.each(txp.actions, (action) => {
          action.copayerName = this._decryptMessage(action.copayerName, encryptingKey);
          action.comment = this._decryptMessage(action.comment, encryptingKey);
          // TODO get copayerName from Credentials -> copayerId to copayerName
          // action.copayerName = null;
        });
        _.each(txp.outputs, (output) => {
          output.encryptedMessage = output.message;
          output.message = this._decryptMessage(output.message, encryptingKey) || null;
        });
        txp.hasUnconfirmedInputs = _.some(txp.inputs, (input: any) => {
          return input.confirmations == 0;
        });
        this._processTxNotes(txp.note);
      });
      return resolve();
    });
  };

  /**
   * Parse errors
   * @private
   * @static
   * @memberof Client.API
   * @param {Object} body
   */
  private _parseError = (body: any): Error => {
    if (!body) return;

    if (_.isString(body)) {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {
          error: body
        };
      }
    }
    let ret;
    if (body.code) {
      if (MWCErrors[body.code]) {
        ret = MWCErrors[body.code];
        if (body.message) ret.message = body.message;
      } else {
        ret = new Error(body.code + ': ' + body.message);
      }
    } else {
      ret = new Error(body.error || JSON.stringify(body));
    }
    this.log.error(ret);
    return ret;
  };

  /**
   * Sign an HTTP request
   * @private
   * @static
   * @memberof Client.API
   * @param {String} method - The HTTP method
   * @param {String} url - The URL for the request
   * @param {Object} args - The arguments in case this is a POST/PUT request
   * @param {String} privKey - Private key to sign the request
   */
  private _signRequest = function (method, url, args, privKey) {
    let message = [method.toLowerCase(), url, JSON.stringify(args)].join('|');
    return Utils.signMessage(message, privKey);
  };


  /**
   * Seed from random
   *
   * @param {Object} opts
   * @param {String} opts.network - default 'livenet'
   */
  seedFromRandom(opts: any): any {
    $.checkArgument(arguments.length <= 1, 'DEPRECATED: only 1 argument accepted.');
    $.checkArgument(_.isUndefined(opts) || _.isObject(opts), 'DEPRECATED: argument should be an options object.');

    opts = opts || {};
    this.credentials = Credentials.create(opts.network || 'livenet');
  };



  /**
   * Seed from random
   *
   * @param {Object} opts
   * @param {String} opts.passphrase
   * @param {String} opts.skipDeviceValidation
   */
  validateKeyDerivation(opts: any): Promise<any> {
    return new Promise((resolve, reject) => {

      let _deviceValidated: boolean;

      opts = opts || {};

      let c = this.credentials;

      function testMessageSigning(xpriv, xpub) {
        let nonHardenedPath = 'm/0/0';
        let message = 'Lorem ipsum dolor sit amet, ne amet urbanitas percipitur vim, libris disputando his ne, et facer suavitate qui. Ei quidam laoreet sea. Cu pro dico aliquip gubergren, in mundi postea usu. Ad labitur posidonium interesset duo, est et doctus molestie adipiscing.';
        let priv = xpriv.deriveChild(nonHardenedPath).privateKey;
        let signature = Utils.signMessage(message, priv);
        let pub = xpub.deriveChild(nonHardenedPath).publicKey;
        return Utils.verifyMessage(message, signature, pub);
      };

      function testHardcodedKeys() {
        let words = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
        let xpriv = Mnemonic(words).toHDPrivateKey();

        if (xpriv.toString() != 'xprv9s21ZrQH143K2jHFB1HM4GNbVaBSSnjHDQP8uBtKKTvusxMirfmKEmaUS4fkwqeoLqVVT2ShayUSmnEZNV1AKqTSESqyAFCBW8nvEqKfvGy') return false;

        xpriv = xpriv.deriveChild("m/44'/0'/0'");
        if (xpriv.toString() != 'xprv9ynVfpDwjVTeyQALCLp4EVHwonHHoE37DoUkjsj6A5vxXK1Wh6YEQVPdgdGdtvqWttM4nqgxK8kgmmRD5yfKhWGbD75JGdsDb9yMtozdVc6') return false;

        let xpub = Bitcore.HDPublicKey.fromString('xpub6Cmr5KkqZs1xBtEoJNM4bdEgMp7nCgkxb2QMYG8hiRTwQ7LfEdrUxHi7XrjNxkeuRrNSqHLXHAuwZvqoeASrp5jxjnpMa4d8PFpA9TRxVCd');
        return testMessageSigning(xpriv, xpub);
      };

      function testLiveKeys() {
        let words;
        try {
          words = c.getMnemonic();
        } catch (ex) { }

        let xpriv;
        if (words && (!c.mnemonicHasPassphrase || opts.passphrase)) {
          let m = new Mnemonic(words);
          xpriv = m.toHDPrivateKey(opts.passphrase, c.network);
        }
        if (!xpriv) {
          xpriv = new Bitcore.HDPrivateKey(c.xPrivKey);
        }
        xpriv = xpriv.deriveChild(c.getBaseAddressDerivationPath());
        let xpub = new Bitcore.HDPublicKey(c.xPubKey);

        return testMessageSigning(xpriv, xpub);
      };

      let hardcodedOk = true;
      if (!_deviceValidated && !opts.skipDeviceValidation) {
        hardcodedOk = testHardcodedKeys();
        _deviceValidated = true;
      }

      let liveOk = (c.canSign() && !c.isPrivKeyEncrypted()) ? testLiveKeys() : true;

      this.keyDerivationOk = hardcodedOk && liveOk;

      return resolve(this.keyDerivationOk);
    });
  };

  /**
   * Seed from random with mnemonic
   *
   * @param {Object} opts
   * @param {String} opts.network - default 'livenet'
   * @param {String} opts.passphrase
   * @param {Number} opts.language - default 'en'
   * @param {Number} opts.account - default 0
   */
  seedFromRandomWithMnemonic(opts: any = {}): any {
    $.checkArgument(arguments.length <= 1, 'DEPRECATED: only 1 argument accepted.');
    $.checkArgument(_.isUndefined(opts) || _.isObject(opts), 'DEPRECATED: argument should be an options object.');

    this.credentials = Credentials.createWithMnemonic(opts.network || 'livenet', opts.passphrase, opts.language || 'en', opts.account || 0);;
  };

  getMnemonic(): any {
    return this.credentials.getMnemonic();
  };

  mnemonicHasPassphrase(): any {
    return this.credentials.mnemonicHasPassphrase;
  };



  clearMnemonic(): any {
    return this.credentials.clearMnemonic();
  };

  getNewMnemonic(data: any): any {
    return new Mnemonic(data, Mnemonic.Words.ENGLISH);
  }

  /**
   * Creates Address from hdPrivKey
   */
  getRootAddress() {
    if (this._rootAddress) return this._rootAddress;
    const xpub = new Bitcore.HDPublicKey(this.credentials.xPubKey);
    return this._rootAddress = Bitcore.Address.fromPublicKey(xpub.deriveChild('m/0/0').publicKey, this.credentials.network);
  }

  /**
   * Seed from extended private key
   *
   * @param {String} xPrivKey
   * @param {Number} opts.account - default 0
   * @param {String} opts.derivationStrategy - default 'BIP44'
   */
  seedFromExtendedPrivateKey(xPrivKey: any, opts: any = {}): void {
    this.credentials = Credentials.fromExtendedPrivateKey(xPrivKey, opts.account || 0, opts.derivationStrategy || Constants.DERIVATION_STRATEGIES.BIP44, opts);
  };


  /**
   * Seed from Mnemonics (language autodetected)
   * Can throw an error if mnemonic is invalid
   *
   * @param {String} BIP39 words
   * @param {Object} opts
   * @param {String} opts.network - default 'livenet'
   * @param {String} opts.passphrase
   * @param {Number} opts.account - default 0
   * @param {String} opts.derivationStrategy - default 'BIP44'
   */
  seedFromMnemonic(words: Array<string>, opts: any = {}): any {
    this.credentials = Credentials.fromMnemonic(opts.network || 'livenet', words, opts.passphrase, opts.account || 0, opts.derivationStrategy || Constants.DERIVATION_STRATEGIES.BIP44, opts);
  };

  /**
   * Seed from external wallet public key
   *
   * @param {String} xPubKey
   * @param {String} source - A name identifying the source of the xPrivKey (e.g. ledger, TREZOR, ...)
   * @param {String} entropySourceHex - A HEX string containing pseudo-random data, that can be deterministically derived from the xPrivKey, and should not be derived from xPubKey.
   * @param {Object} opts
   * @param {Number} opts.account - default 0
   * @param {String} opts.derivationStrategy - default 'BIP44'
   */
  seedFromExtendedPublicKey(xPubKey: any, source: any, entropySourceHex: any, opts: any = {}): any {
    this.credentials = Credentials.fromExtendedPublicKey(xPubKey, source, entropySourceHex, opts.account || 0, opts.derivationStrategy || Constants.DERIVATION_STRATEGIES.BIP44);
  };


  /**
   * Export wallet
   *
   * @param {Object} opts
   * @param {Boolean} opts.password
   * @param {Boolean} opts.noSign
   */
  export(opts: any = {}): any {
    $.checkState(this.credentials);

    let output;

    let c = Credentials.fromObj(this.credentials);

    if (opts.noSign) {
      c.setNoSign();
    } else if (opts.password) {
      c.decryptPrivateKey(opts.password);
    }

    output = JSON.stringify(c.toObj());

    return output;
  };


  /**
   * Import wallets
   *
   * @param {Object} str - The serialized JSON created with #export
   */
  import(str: string): any {
    try {
      let credentials = Credentials.fromObj(JSON.parse(str));
      this.credentials = credentials;
    } catch (ex) {
      throw MWCErrors.INVALID_BACKUP;
    }
  };

  async _import(): Promise<any> {

      $.checkState(this.credentials);

      try {
        return await this.openWallet();
      } catch (e) {

        if (e.code != 'NOT_AUTHORIZED') {
          throw e;
        } else {

          const walletPrivKey = new Bitcore.PrivateKey(void 0, this.credentials.network);
          const pubkey = walletPrivKey.toPublicKey();
          this.credentials.addWalletPrivateKey(walletPrivKey.toString());
          let rootAddress = this.getRootAddress();

          let defaultOpts = {
            m: 1,
            n: 1,
            walletName: 'Personal Wallet',
            copayerName: 'me'
          };

          //call 'recreate wallet' method to create wallet instance with exision
          let args = {
            m: defaultOpts.m,
            n: defaultOpts.n,
            walletName: defaultOpts.walletName,
            copayerName: defaultOpts.copayerName,
            pubKey: pubkey.toString(),
            rootAddress: rootAddress.toString(),
            network: this.credentials.network,
            singleAddress: true, //daedalus wallets are single-addressed
          };

          let res = await this._doPostRequest('/v1/recreate_wallet/', args);

          if (res) {
            let walletId = res.walletId;
            let parentAddress = res.parentAddress;
            this.credentials.addWalletInfo(walletId, defaultOpts.walletName, defaultOpts.m, defaultOpts.n, defaultOpts.copayerName, parentAddress);

            return this.doJoinWallet(walletId, walletPrivKey, this.credentials.xPubKey, this.credentials.requestPubKey, defaultOpts.copayerName, {});
          } else {
            throw new Error('failed to recreate wallet');
          }

        }

      }

  };

  /**
   * Import from Mnemonics (language autodetected)
   * Can throw an error if mnemonic is invalid
   *
   * @param {String} BIP39 words
   * @param {Object} opts
   * @param {String} opts.network - default 'livenet'
   * @param {String} opts.passphrase
   * @param {Number} opts.account - default 0
   * @param {String} opts.derivationStrategy - default 'BIP44'
   * @param {String} opts.entropySourcePath - Only used if the wallet was created on a HW wallet, in which that private keys was not available for all the needed derivations
   */
  importFromMnemonic(words: string, opts: any = {}): Promise<any> {
      this.log.debug('Importing from 12 Words');

      function derive(nonCompliantDerivation) {
        return Credentials.fromMnemonic(opts.network || 'livenet', words, opts.passphrase, opts.account || 0, opts.derivationStrategy || Constants.DERIVATION_STRATEGIES.BIP44, {
          nonCompliantDerivation: nonCompliantDerivation,
          entropySourcePath: opts.entropySourcePath,
        });
      };

      try {
        this.credentials = derive(false);
      } catch (e) {
        this.log.info('Mnemonic error:', e);
        return Promise.reject(MWCErrors.INVALID_BACKUP);
      }

      return this._import().catch(err => {
        if (err == MWCErrors.INVALID_BACKUP) return Promise.reject(err);
        if (err == MWCErrors.NOT_AUTHORIZED || err == MWCErrors.WALLET_DOES_NOT_EXIST) {

            let altCredentials = derive(true);
            if (altCredentials.xPubKey.toString() == this.credentials.xPubKey.toString()) return Promise.reject(err);
            this.credentials = altCredentials;
            return this._import();
        }
        return Promise.reject(err);
      });

  };

  /*
  * Import from extended private key
  *
  * @param {String} xPrivKey
  * @param {Number} opts.account - default 0
  * @param {String} opts.derivationStrategy - default 'BIP44'
  * @param {Callback} cb - The callback that handles the response. It returns a flag indicating that the wallet is imported.
  */
  importFromExtendedPrivateKey(xPrivKey: any, opts: any = {}): Promise<any> {
    this.log.debug('Importing from Extended Private Key');

    try {
      this.credentials = Credentials.fromExtendedPrivateKey(xPrivKey, opts.account || 0, opts.derivationStrategy || Constants.DERIVATION_STRATEGIES.BIP44);
    } catch (e) {
      this.log.info('xPriv error:', e);
      return new Promise((resolve, reject) => { return reject(MWCErrors.INVALID_BACKUP); });
    };

    return this._import();
  };

  /**
   * Import from Extended Public Key
   *
   * @param {String} xPubKey
   * @param {String} source - A name identifying the source of the xPrivKey
   * @param {String} entropySourceHex - A HEX string containing pseudo-random data, that can be deterministically derived from the xPrivKey, and should not be derived from xPubKey.
   * @param {Object} opts
   * @param {Number} opts.account - default 0
   * @param {String} opts.derivationStrategy - default 'BIP44'
   */
  importFromExtendedPublicKey(xPubKey: any, source: any, entropySourceHex: any, opts: any = {}): Promise<any> {
    $.checkArgument(arguments.length == 5, "DEPRECATED: should receive 5 arguments");

    this.log.debug('Importing from Extended Private Key');
    try {
      this.credentials = Credentials.fromExtendedPublicKey(xPubKey, source, entropySourceHex, opts.account || 0, opts.derivationStrategy || Constants.DERIVATION_STRATEGIES.BIP44);
    } catch (e) {
      this.log.info('xPriv error:', e);
      return new Promise((resolve, reject) => { return reject(MWCErrors.INVALID_BACKUP); });
    };

    return this._import();
  };

  decryptBIP38PrivateKey(encryptedPrivateKeyBase58: any, passphrase: string, opts: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {

      let bip38 = new Bip38();

      let privateKeyWif;
      try {
        privateKeyWif = bip38.decrypt(encryptedPrivateKeyBase58, passphrase);
      } catch (ex) {
        return reject(new Error('Could not decrypt BIP38 private key: ' + ex));
      }

      let privateKey = new Bitcore.PrivateKey(privateKeyWif, 'livenet');
      let address = privateKey.publicKey.toAddress().toString();
      let addrBuff = new Buffer(address, 'ascii');
      let actualChecksum = Bitcore.crypto.Hash.sha256sha256(addrBuff).toString('hex').substring(0, 8);
      let expectedChecksum = Bitcore.encoding.Base58Check.decode(encryptedPrivateKeyBase58).toString('hex').substring(6, 14);

      if (actualChecksum != expectedChecksum)
        return reject(new Error('Incorrect passphrase'));

      return resolve(privateKeyWif);
    });
  };


  getBalanceFromPrivateKey(_privateKey: string): Promise<any> {
    return new Promise((resolve, reject) => {

      let privateKey = new Bitcore.PrivateKey(_privateKey);
      let address = privateKey.publicKey.toAddress();
      return this.getUtxos({
        addresses: address.toString(),
      }).then((utxos) => {
        return resolve(_.sumBy(utxos, 'micros'));
      });
    });
  };

  buildTxFromPrivateKey(_privateKey: any, destinationAddress: any, opts: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      let privateKey = new Bitcore.PrivateKey(_privateKey);
      let address = privateKey.publicKey.toAddress();

      return this.getUtxos({
        addresses: address.toString(),
      }).then((utxos) => {
        if (!_.isArray(utxos) || utxos.length == 0) return reject(new Error('No utxos found'));

        let fee = opts.fee || DEFAULT_FEE;
        let amount = _.sumBy(utxos, 'micros') - fee;
        if (amount <= 0) return reject(MWCErrors.INSUFFICIENT_FUNDS);

        let tx;
        try {
          let toAddress = Bitcore.Address.fromString(destinationAddress);

          tx = new Bitcore.Transaction()
            .from(utxos)
            .to(toAddress, amount)
            .fee(fee)
            .sign(privateKey);

          // Make sure the tx can be serialized
          tx.serialize();

        } catch (ex) {
          this.log.error('Could not build transaction from private key', ex);
          return reject(MWCErrors.COULD_NOT_BUILD_TRANSACTION);
        }
        return resolve(tx);
      });
    });
  };

  /**
   * Create and send invite tx to a given address
   *
   * @param {string} toAddress - merit address to send invite to
   * @param {number=} amount - number of invites to send. defaults to 1
   * @param {string=} message - message to send to a receiver
   *
   */
  async sendInvite(toAddress: string, amount: number = 1, script = null, message: string = '', walletPassword: string = ''): Promise<any> {
    const opts = {
      invite: true,
      outputs: [_.pickBy({
        amount,
        toAddress,
        message,
        script,
      })],
    };

    let txp = await this.createTxProposal(opts)
    txp = await this.publishTxProposal({ txp });
    txp = await this.signTxProposal(txp, walletPassword);
    txp = await this.broadcastTxProposal(txp);

    return txp;
  }

  /**
   * Create an easySend script and create a transaction to the script address
   *
   * @param {Object}      opts
   * @param {string}      opts.passphrase       - optional password to generate receiver's private key
   * @param {number}      opts.timeout          - maximum depth transaction is redeemable by receiver
   * @param {string}      opts.walletPassword   - maximum depth transaction is redeemable by receiver
   * @param {string}      opts.parentAddress    - parent address of easy send recipient
   * @param {Callback}    cb
   */
  buildEasySendScript(opts: any = {}): Promise<EasySend> {
    return new Promise((resolve, reject) => {

      let result: any = {}
      return this.getMainAddresses().then((addresses) => {
        if(_.isEmpty(addresses)) return this.createAddress({});
        return _.sample(addresses);
      }).then((addr) => {
        if (addr.publicKeys.length < 1) {
          return reject(Error('Error creating an address for easySend'));
        }
        let pubKey = Bitcore.PublicKey.fromString(addr.publicKeys[0]);

        // {key, secret}
        let network = opts.network || ENV.network;
        let rcvPair = Bitcore.PrivateKey.forNewEasySend(opts.passphrase, network);

        let pubKeys = [
          rcvPair.key.publicKey.toBuffer(),
          pubKey.toBuffer()
        ];

        let timeout = opts.timeout || 1008;
        let script = Bitcore.Script.buildEasySendOut(pubKeys, timeout, network);

        result = {
          receiverPubKey: rcvPair.key.publicKey,
          script: script.toMixedScriptHashOut(pubKey),
          senderName: 'Someone', // TODO: get user name or drop sender name from data
          senderPubKey: pubKey.toString(),
          secret: rcvPair.secret.toString('hex'),
          blockTimeout: timeout,
          parentAddress: opts.parentAddress
        };

        return resolve(result);
      });

    });
  }

  /**
   * Creates a transaction to redeem an easy send transaction. The input param
   * must contain
   *    {
   *      txs: [<transaction info from getinputforeasysend cli call>],
   *      privateKey: <private key used to sign script>,
   *      publicKey: <pub key of the private key>,
   *      script: <easysend script to redeem>,
   *      scriptId: <Address used script>
   *    }
   *
   * input.txs contains
   *     {
   *      amount: <amount in MRT to redeem>,
   *      index: <index of unspent transaction>,
   *      txid: <id of transaction associated with the scriptId>
   *     }
   * @param {input} Input described above.
   * @param {destinationAddress} Address to put the funds into.
   */
  buildEasySendRedeemTransaction(input: any, txn: any, destinationAddress: string, opts: any = {}): Promise<any> {
    //TODO: Create and sign a transaction to redeem easy send. Use input as
    //unspent Txo and use script to create scriptSig
    let inputAddress = input.scriptId;

    let fee = opts.fee || DEFAULT_FEE;
    let amount = 0;
    let micros = 0;

    if (!txn.invite) {
      micros = Bitcore.Unit.fromMRT(txn.amount).toMicros();
      amount = micros - fee;
    } else {
      micros = txn.amount;
      amount = micros;
    }

    if (amount <= 0) return Promise.reject(MWCErrors.INSUFFICIENT_FUNDS);

    let tx = new Bitcore.Transaction();

    if (txn.invite) {
      tx.version = Bitcore.Transaction.INVITE_VERSION;
    }

    console.log(input.script.inspect());
    try {
      let toAddress = destinationAddress;
      let p2shScript = input.script.toMixedScriptHashOut(input.senderPublicKey);

      tx.addInput(
        new Bitcore.Transaction.Input.PayToScriptHashInput({
          output: Bitcore.Transaction.Output.fromObject({
            script: p2shScript,
            micros,
          }),
          prevTxId: txn.txid,
          outputIndex: txn.index,
          script: input.script
        }, input.script, p2shScript));

      tx.to(toAddress, amount);

      if (!txn.invite) {
        tx.fee(fee);
      }

      let sig = Bitcore.Transaction.Sighash.sign(tx, input.privateKey, Bitcore.crypto.Signature.SIGHASH_ALL, 0, input.script);
      let inputScript = Bitcore.Script.buildEasySendIn(
        sig,
        input.script,
        Bitcore.PublicKey.fromString(input.senderPublicKey)._getID(),
      );

      tx.inputs[0].setScript(inputScript);

      const txOpts = !txn.invite ? {} : {
        disableSmallFees: true,
      }
      // Make sure the tx can be serialized
      tx.serialize(txOpts);

    } catch (ex) {
      this.log.error('Could not build transaction from private key ' + ex.toString());
      return Promise.reject(MWCErrors.COULD_NOT_BUILD_TRANSACTION);
    }
    return Promise.resolve(tx);
  };

  prepareVault(type: number, opts: any = {}) {
    if (type == 0) {
      let tag = opts.masterPubKey.toAddress().hashBuffer;
      const spendLimit = Bitcore.Unit.fromMRT(Constants.VAULT_SPEND_LIMIT).toMicros();

      let whitelist = _.map(opts.whitelist, (e) => {
        return Bitcore.Address.fromBuffer(e).hashBuffer;
      });

      const network = opts.masterPubKey.network.name;

      let params = [
        opts.spendPubKey.toBuffer(),
        opts.masterPubKey.toBuffer(),
      ];

      params.push(Bitcore.crypto.BN.fromNumber(spendLimit).toScriptNumBuffer());
      params = params.concat(whitelist);
      params.push(Bitcore.Opcode.smallInt(whitelist.length));
      params.push(tag);
      params.push(Bitcore.Opcode.smallInt(type));

      let redeemScript = Bitcore.Script.buildSimpleVaultScript(tag, network);
      let scriptPubKey = Bitcore.Script.buildMixedParameterizedP2SH(redeemScript, params, opts.masterPubKey);

      let vault = {
        type: type,
        amount: opts.amount,
        tag: opts.masterPubKey.toAddress().hashBuffer,
        whitelist: opts.whitelist,
        spendPubKey: opts.spendPubKey,
        masterPubKey: opts.masterPubKey,
        redeemScript: redeemScript,
        scriptPubKey: scriptPubKey,
        address: Bitcore.Address(scriptPubKey.getAddressInfo()),
        coins: []
      };

      return vault;
    } else {
      throw new Error('Unsupported vault type');
    }
  }

  /**
   * Renew vault
   * Will make all pending tx invalid
   */
  buildRenewVaultTx(coins: any[], newVault: any, masterKey: any, opts: any = {}) {

    var network = opts.network || ENV.network;
    var fee = opts.fee || DEFAULT_FEE;

    let totalAmount = _.sumBy(coins, 'micros');

    let amount = totalAmount - fee;
    if (amount <= 0) return MWCErrors.INSUFFICIENT_FUNDS;

    let redeemScript = new Bitcore.Script(newVault.redeemScript);

    var tx = new Bitcore.Transaction();

    try {

      if (newVault.type == 0) {
        const spendLimit = Bitcore.Unit.fromMRT(Constants.VAULT_SPEND_LIMIT).toMicros();

        let tag = newVault.tag;

        let whitelist = _.map(newVault.whitelist, (e) => {
          return Bitcore.Address.fromBuffer(e).hashBuffer;
        });

        let params = [
          new Bitcore.PublicKey(newVault.spendPubKey, { network }).toBuffer(),
          new Bitcore.PublicKey(newVault.masterPubKey, { network }).toBuffer()
        ];

        params.push(Bitcore.crypto.BN.fromNumber(spendLimit).toScriptNumBuffer());
        params = params.concat(whitelist);
        params.push(Bitcore.Opcode.smallInt(whitelist.length));
        params.push(new Buffer(tag));
        params.push(Bitcore.Opcode.smallInt(newVault.type));

        let scriptPubKey = Bitcore.Script.buildMixedParameterizedP2SH(redeemScript, params, masterKey.publicKey);

        tx.addOutput(new Bitcore.Transaction.Output({
          script: scriptPubKey,
          micros: amount,
        }));

        tx.fee(fee);

        _.forEach(coins, coin => {
          tx.addInput(
            new Bitcore.Transaction.Input.PayToScriptHashInput({
              prevTxId: coin.txid,
              outputIndex: coin.vout,
              script: redeemScript,
            }, redeemScript, coin.scriptPubKey),
            coin.scriptPubKey, coin.micros);
        });

        tx.addressType = 'PP2SH';

        _.forEach(tx.inputs, (input, i) => {
          let sig = Bitcore.Transaction.Sighash.sign(tx, masterKey.privateKey, Bitcore.crypto.Signature.SIGHASH_ALL, i, redeemScript);
          let inputScript = Bitcore.Script.buildVaultRenewIn(sig, redeemScript, Bitcore.PublicKey(newVault.masterPubKey, network));
          input.setScript(inputScript);
        });

        // Make sure the tx can be serialized
        tx.serialize();

      } else {
        this.log.error('Vault type is not supported:', newVault.type);
        return MWCErrors.COULD_NOT_BUILD_TRANSACTION;
      }
    } catch (ex) {
      this.log.error('Could not build transaction from private key', ex);
      return MWCErrors.COULD_NOT_BUILD_TRANSACTION;
    }

    return tx;
  };

  /**
   * Build spend tx for vault
   */
  buildSpendVaultTx(vault: any, coins: any[], spendKey: any, amount: number, address: any, opts: any = {}) {

    var network = vault.address.network;
    var fee = opts.fee || DEFAULT_FEE;

    let availableAmount = _.sumBy(coins, 'micros');

    if (amount >= availableAmount) throw MWCErrors.INSUFFICIENT_FUNDS;

    let selectedCoins = [];
    let selectedAmount = 0;
    for(let c = 0; c < coins.length && selectedAmount < amount; c++) {
      let coin = coins[c];

      selectedAmount += coin.micros;
      selectedCoins.push(coin);
    }

    //should never be true
    if(selectedAmount < amount) throw MWCErrors.INSUFFICIENT_FUNDS;

    let change = selectedAmount - amount;

    let redeemScript = new Bitcore.Script(vault.redeemScript);

    let tx = new Bitcore.Transaction();

    try {

      if(vault.type == 0) {
        const spendLimit = Bitcore.Unit.fromMRT(Constants.VAULT_SPEND_LIMIT).toMicros();

        let toAddress = Bitcore.Address.fromString(address);
        tx.to(toAddress, amount - fee * 10);

        let whitelist = _.map(vault.whitelist, (e) => {
          return Bitcore.Address.fromBuffer(e).hashBuffer;
        });

        let params = [
          new Bitcore.PublicKey(vault.spendPubKey, { network }).toBuffer(),
          new Bitcore.PublicKey(vault.masterPubKey, { network }).toBuffer(),
        ];

        params.push(Bitcore.crypto.BN.fromNumber(spendLimit).toScriptNumBuffer());
        params = params.concat(whitelist);
        params.push(Bitcore.Opcode.smallInt(whitelist.length));
        params.push(new Buffer(vault.tag));
        params.push(Bitcore.Opcode.smallInt(vault.type));

        let scriptPubKey = Bitcore.Script.buildMixedParameterizedP2SH(redeemScript, params, vault.masterPubKey);

        tx.addOutput(new Bitcore.Transaction.Output({
          script: scriptPubKey,
          micros: change
        }));

        tx.fee(fee * 10);

        _.forEach(selectedCoins, (coin) => {
          tx.addInput(
            new Bitcore.Transaction.Input.PayToScriptHashInput({
              prevTxId: coin.txid,
              outputIndex: coin.vout,
              script: redeemScript,
            }, redeemScript, coin.scriptPubKey),
            coin.scriptPubKey, coin.micros);
        });

        tx.addressType = 'PP2SH';

        _.forEach(tx.inputs, (input, i) => {
          let sig = Bitcore.Transaction.Sighash.sign(tx, spendKey.privateKey, Bitcore.crypto.Signature.SIGHASH_ALL, i, redeemScript);
          let inputScript = Bitcore.Script.buildVaultSpendIn(sig, redeemScript, new Bitcore.PublicKey(vault.masterPubKey, network));
          input.setScript(inputScript);
        });

        // Make sure the tx can be serialized
        tx.serialize();

      } else {
        this.log.error('Vault type is not supported:', vault.type);
        throw MWCErrors.COULD_NOT_BUILD_TRANSACTION;
      }
    } catch (ex) {
      this.log.error('Could not build transaction from private key', ex);
      throw MWCErrors.COULD_NOT_BUILD_TRANSACTION;
    }

    return tx;
  };

  /**
   * Open a wallet and try to complete the public key ring.
   *
   * @param {Callback} cb - The callback that handles the response. It returns a flag indicating that the wallet is complete.
   * @fires API#walletCompleted
   */
  openWallet(): Promise<any> {
    this.log.warn("Opening wallet");
    return new Promise((resolve, reject) => {

      $.checkState(this.credentials);
      if (this.credentials.isComplete() && this.credentials.hasWalletInfo()) {
        this.log.warn("WALLET OPEN");
        return resolve(true); // wallet is already open
      }

      return this._doGetRequest('/v1/wallets/?includeExtendedInfo=1').then((ret) => {
        let wallet = ret.wallet;

        return this._processStatus(ret).then(() => {

          if (!this.credentials.hasWalletInfo()) {
            let me: any = _.find(wallet.copayers, {
              id: this.credentials.copayerId
            });
            this.credentials.addWalletInfo(wallet.id, wallet.name, wallet.m, wallet.n, me.name, wallet.parentAddress);
          }

          if (wallet.status != 'complete')
            return resolve();

          if (this.credentials.walletPrivKey) {
            if (!Verifier.checkCopayers(this.credentials, wallet.copayers)) {
              return reject(MWCErrors.SERVER_COMPROMISED);
            }
          } else {
            // this should only happen in AIR-GAPPED flows
            this.log.warn('Could not verify copayers key (missing wallet Private Key)');
          }

          this.credentials.addPublicKeyRing(this._extractPublicKeyRing(wallet.copayers));

          this.eventEmitter.emit('walletCompleted', wallet.id);

          return resolve(ret);
        });
      }).catch(err => {
        return reject(err);
      });
    });
  };

  _getHeaders(method: string, url: string, args: any): any {
    let headers = {
      'x-client-version': 'MWC-' + Package.version,
    };

    return headers;
  };


  /**
   * Do an HTTP request
   * @private
   *
   * @param {Object} method
   * @param {String} url
   * @param {Object} args
   * @param {Callback} cb
   */
  _doRequest(method: string, url: string, args: any, useSession: boolean, secondRun = false): Promise<{ body: any, header: any }> {
    return new Promise((resolve, reject) => {

      let headers = this._getHeaders(method, url, args);

      if (this.credentials) {
        headers['x-identity'] = this.credentials.copayerId;

        if (useSession && this.session) {
          headers['x-session'] = this.session;
        } else {
          let reqSignature;
          let key = args._requestPrivKey || this.credentials.requestPrivKey;
          if (key) {
            delete args['_requestPrivKey'];
            reqSignature = this._signRequest(method, url, args, key);
          }
          headers['x-signature'] = reqSignature;
        }
      }

      let r = this.request[method](this.baseUrl + url);

      r.accept('json');

      _.each(headers, function (v, k) {
        if (v) r.set(k, v);
      });

      if (args) {
        if (method == 'post' || method == 'put') {
          r.send(args);

        } else {
          r.query(args);
        }
      }

      r.timeout(this.timeout);
      r.ok(res => res.status < 500); // dont reject on failed status

      return Promise.resolve(r).then((res) => {

        /**
         * Universal MWC Logger.  It will log all output returned from BWS
         * if the private static DEBUG_MODE is set to true above.
         */
        if (res.body && this.DEBUG_MODE) {
          this.log.info("BWS Response: ");
          this.log.info(util.inspect(res.body, {
            depth: 10
          }));
        }

        if (res.status !== 200) {
          if (res.status === 404)
            return reject(MWCErrors.NOT_FOUND);

          if (res.code == MWCErrors.AUTHENTICATION_ERROR.code) {
            if (this.onAuthenticationError) this.onAuthenticationError();
            return reject(MWCErrors.AUTHENTICATION_ERROR);
          }

          if (!res.status) {
            return reject(MWCErrors.CONNECTION_ERROR);
          }

          this.log.error('HTTP Error:' + res.status);

          if (!res.body) return reject(new Error(res.status.toString()));

          return reject(this._parseError(res.body));
        }

        if (res.body === '{"error":"read ECONNRESET"}') {
          return reject(MWCErrors.ECONNRESET_ERROR);
        }

        if(this.onConnectionRestored) {
          this.onConnectionRestored();
        }

        return resolve(res);
      }).catch((err) => {

        if (!err.status) {
          return reject(MWCErrors.CONNECTION_ERROR);
        } else if (err.status == 502 || err.status == 504){
          return reject(MWCErrors.SERVER_UNAVAILABLE);
        }

        if (!err.response || !err.response.text) {
          return reject(err);
        }

        let errObj; // not an instance of Error
        try {
          errObj = JSON.parse(err.response.text);
        } catch (e) {
          return reject(err);
        }

        if (errObj.code == MWCErrors.AUTHENTICATION_ERROR.code) {
          if (!secondRun) { //trying to restore session one time
            return this._doRequest('post', '/v1/login', {}, null, true).then(() => {
              return this._doRequest(method, url, args, useSession, true);
            }).catch(() => {
              if(this.onAuthenticationError) {
                return Promise.resolve(this.onAuthenticationError());
              }
            })
          } else {
            if(this.onAuthenticationError) {
              return Promise.resolve(this.onAuthenticationError());
            }
          }
        }

        if (errObj.code && MWCErrors[errObj.code]) return reject(MWCErrors[errObj.code]);
        return reject(err);
      });
    });
  };

  private _login(): Promise<any> {
    return this._doPostRequest('/v1/login', {});
  };

  private _logout(): Promise<any> {
    return this._doPostRequest('/v1/logout', {});
  };

  /**
   * Do an HTTP request
   * @private
   *
   * @param {Object} method
   * @param {String} url
   * @param {Object} args
   */
  private _doRequestWithLogin(method: string, url: string, args: any): Promise<any> {

    let doLogin = (): Promise<any> => {
      return new Promise((resolve, reject) => {
        return this._login().then((s) => {
          if (!s) return reject(MWCErrors.NOT_AUTHORIZED);
          this.session = s;
          return resolve();
        }).catch((err) => {
          return reject(err);
        });
      });
    };

    let loginIfNeeded = (): Promise<any> => {
      return new Promise((resolve, reject) => {
        if (this.session) {
          return resolve();
        }
        return resolve(doLogin());
      });
    }


    return loginIfNeeded().then(() => {
      return this._doRequest(method, url, args, true);
    }).then((res) => {
      return res.body;
    });
  };

  /**
   * Do a POST request
   * @private
   *
   * @param {String} url
   * @param {Object} args
   * @param {Callback} cb
   */
  _doPostRequest(url: string, args: any): Promise<any> {
    return this._doRequest('post', url, args, false).then((res) => {
      return res.body;
    });
  };

  _doPutRequest(url: string, args: any): Promise<any> {
    return this._doRequest('put', url, args, false).then((res) => {
      return res.body;
    });
  };

  /**
   * Do a GET request
   * @private
   *
   * @param {String} url
   * @param {Callback} cb
   */
  _doGetRequest(url: string): Promise<any> {
    url += url.indexOf('?') > 0 ? '&' : '?';
    url += 'r=' + _.random(10000, 99999);
    return this._doRequest('get', url, {}, false).then((res) => {
      return res.body;
    });
  };

  _doGetRequestWithLogin(url: string): Promise<any> {
    url += url.indexOf('?') > 0 ? '&' : '?';
    url += 'r=' + _.random(10000, 99999);
    return this._doRequestWithLogin('get', url, {}).catch((err) => {
      this.log.warn("Were not able to complete getRequest: ", err);
    });
  };

  /**
   * Do a DELETE request
   * @private
   *
   * @param {String} url
   * @param {Callback} cb
   */
  private _doDeleteRequest(url: string): Promise<any> {
    return this._doRequest('delete', url, {}, false).then((res) => {
      return res.body;
    });
  };

  private _buildSecret = function (walletId, walletPrivKey, network) {
    if (_.isString(walletPrivKey)) {
      walletPrivKey = Bitcore.PrivateKey.fromString(walletPrivKey);
    }
    let widHex = new Buffer(walletId.replace(/-/g, ''), 'hex');
    let widBase58 = new Bitcore.encoding.Base58(widHex).toString();
    return _.padEnd(widBase58, 22, '0') + walletPrivKey.toWIF() + (network == 'testnet' ? 'T' : 'L');
  };

  parseSecret(secret: string): any {
    $.checkArgument(secret);

    function split(str, indexes) {
      let parts = [];
      indexes.push(str.length);
      let i = 0;
      while (i < indexes.length) {
        parts.push(str.substring(i == 0 ? 0 : indexes[i - 1], indexes[i]));
        i++;
      };
      return parts;
    };

    try {
      let secretSplit = split(secret, [22, 74]);
      let widBase58 = secretSplit[0].replace(/0/g, '');
      let widHex = Bitcore.encoding.Base58.decode(widBase58).toString('hex');
      let walletId = split(widHex, [8, 12, 16, 20]).join('-');

      let walletPrivKey = Bitcore.PrivateKey.fromString(secretSplit[1]);
      let networkChar = secretSplit[2];

      return {
        walletId: walletId,
        walletPrivKey: walletPrivKey,
        network: networkChar == 'T' ? 'testnet' : 'livenet',
      };
    } catch (ex) {
      throw new Error('Invalid secret');
    }
  };

  buildTx(txp: any): any {
    return Utils.buildTx(txp);
  }

  getRawTx(txp: any): any {
    let t = Utils.buildTx(txp);

    return t.uncheckedSerialize();
  };

  signTxp(txp: any, derivedXPrivKey): any {
    //Derive proper key to sign, for each input
    let privs = [];
    let derived = {};

    let xpriv = new Bitcore.HDPrivateKey(derivedXPrivKey);

    _.each(txp.inputs, function (i) {
      $.checkState(i.path, "Input derivation path not available (signing transaction)")
      if (!derived[i.path]) {
        derived[i.path] = xpriv.deriveChild(i.path).privateKey;
        privs.push(derived[i.path]);
      }
    });

    let t = Utils.buildTx(txp);

    let signatures = _.map(privs, function (priv, i) {
      return t.getSignatures(priv);
    });

    signatures = _.map(_.sortBy(_.flatten(signatures), 'inputIndex'), function (s) {
      return s.signature.toDER().toString('hex');
    });

    return signatures;
  };

  private _signTxp(txp, password): any {
    let derived = this.credentials.getDerivedXPrivKey(password);
    return this.signTxp(txp, derived);
  };

  _getCurrentSignatures(txp: any): any {
    let acceptedActions = _.filter(txp.actions, {
      type: 'accept'
    });

    return _.map(acceptedActions, function (x: any) {
      return {
        signatures: x.signatures,
        xpub: x.xpub,
      };
    });
  };

  _addSignaturesToBitcoreTx(txp: any, t: any, signatures: any, xpub: any): any {
    if (signatures.length != txp.inputs.length)
      throw new Error('Number of signatures does not match number of inputs');

    let i = 0,
      x = new Bitcore.HDPublicKey(xpub);

    _.each(signatures, function (signatureHex) {
      let input = txp.inputs[i];
      try {
        let signature = Bitcore.crypto.Signature.fromString(signatureHex);
        let pub = x.deriveChild(txp.inputPaths[i]).publicKey;
        let s = {
          inputIndex: i,
          signature: signature,
          sigtype: Bitcore.crypto.Signature.SIGHASH_ALL,
          publicKey: pub,
        };
        t.inputs[i].addSignature(t, s);
        i++;
      } catch (e) { };
    });

    if (i != txp.inputs.length)
      throw new Error('Wrong signatures');
  };


  _applyAllSignatures(txp: any, t: any): any {

    $.checkState(txp.status == 'accepted');

    let sigs = this._getCurrentSignatures(txp);
    _.each(sigs, function (x) {
      this._addSignaturesToBitcoreTx(txp, t, x.signatures, x.xpub);
    });
  };

  /**
   * Join
   * @public
   *
   * @param {String} walletId
   * @param {String} walletPrivKey
   * @param {String} xPubKey
   * @param {String} requestPubKey
   * @param {String} copayerName
   * @param {Object} Optional args
   * @param {String} opts.customData
   * @param {Callback} cb
   */
  public doJoinWallet(walletId: any, walletPrivKey: any, xPubKey: any, requestPubKey: any, copayerName: string, opts: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {

      // Adds encrypted walletPrivateKey to CustomData
      opts.customData = opts.customData || {};
      opts.customData.walletPrivKey = walletPrivKey.toString();
      let encCustomData = Utils.encryptMessage(JSON.stringify(opts.customData), this.credentials.personalEncryptingKey);
      let encCopayerName = Utils.encryptMessage(copayerName, this.credentials.sharedEncryptingKey);

      let args: any = {
        walletId: walletId,
        name: encCopayerName,
        xPubKey: xPubKey,
        requestPubKey: requestPubKey,
        customData: encCustomData,
      };
      if (opts.dryRun) args.dryRun = true;

      if (_.isBoolean(opts.supportBIP44AndP2PKH))
        args.supportBIP44AndP2PKH = opts.supportBIP44AndP2PKH;

      let hash = Utils.getCopayerHash(args.name, args.xPubKey, args.requestPubKey);
      args.copayerSignature = Utils.signMessage(hash, walletPrivKey);

      let url = '/v1/wallets/' + walletId + '/copayers';
      return this._doPostRequest(url, args).then((body) => {
        return this._processWallet(body.wallet).then(() => {
          return resolve(body.wallet);
        });
      }).catch((err) => {
        return reject(err);
      });
    });
  };

  /**
   * Return if wallet is complete
   */
  isComplete(): any {
    return this.credentials && this.credentials.isComplete();
  };

  /**
   * Is private key currently encrypted?
   *
   * @return {Boolean}
   */
  isPrivKeyEncrypted(): any {
    return this.credentials && this.credentials.isPrivKeyEncrypted();
  };

  /**
   * Is private key external?
   *
   * @return {Boolean}
   */
  isPrivKeyExternal(): any {
    return this.credentials && this.credentials.hasExternalSource();
  };

  /**
   * Get external wallet source name
   *
   * @return {String}
   */
  getPrivKeyExternalSourceName(): any {
    return this.credentials ? this.credentials.getExternalSourceName() : null;
  };

  /**
   * Returns unencrypted extended private key and mnemonics
   *
   * @param password
   */
  getKeys(password: string): any {
    return this.credentials.getKeys(password);
  };


  /**
   * Checks is password is valid
   * Returns null (keys not encrypted), true or false.
   *
   * @param password
   */
  checkPassword(password: string): any {
    if (!this.isPrivKeyEncrypted()) return;

    try {
      let keys = this.getKeys(password);
      return !!keys.xPrivKey;
    } catch (e) {
      return false;
    };
  };


  /**
   * Can this credentials sign a transaction?
   * (Only returns fail on a 'proxy' setup for airgapped operation)
   *
   * @return {undefined}
   */
  canSign(): any {
    return this.credentials && this.credentials.canSign();
  };


  private _extractPublicKeyRing = function (copayers) {
    return _.map(copayers, function (copayer: any) {
      let pkr: any = _.pick(copayer, ['xPubKey', 'requestPubKey']);
      pkr.copayerName = copayer.name;
      return pkr;
    });
  };

  /**
   * sets up encryption for the extended private key
   *
   * @param {String} password Password used to encrypt
   * @param {Object} opts optional: SJCL options to encrypt (.iter, .salt, etc).
   * @return {undefined}
   */
  encryptPrivateKey(password: string, opts?: any): any {
    this.credentials.encryptPrivateKey(password, opts || this.privateKeyEncryptionOpts);
  };

  /**
   * disables encryption for private key.
   *
   * @param {String} password Password used to encrypt
   */
  decryptPrivateKey(password: string): any {
    return this.credentials.decryptPrivateKey(password);
  };

  /**
   * Get current fee levels for the specified network
   *
   * @param {string} network - 'livenet' (default) or 'testnet'
   * @returns {Callback} cb - Returns error or an object with status information
   */
  getFeeLevels(network: string): Promise<any> {
      (!$.checkArgument(network || _.includes(['livenet', 'testnet'], network)));

      return this._doGetRequest('/v1/feelevels/?network=' + (network || ENV.network));
  };

  /**
   * Get service version
   *
   * @param {Callback} cb
   */
  getVersion(): any {
    this._doGetRequest('/v1/version/');
  };

  _checkKeyDerivation(): any {
    let isInvalid = (this.keyDerivationOk === false);
    if (isInvalid) {
      this.log.error('Key derivation for this device is not working as expected');
    }
    return !isInvalid;
  };

  /**
   *
   * Create a wallet.
   * @param {String} walletName
   * @param {String} copayerName
   * @param {Number} m
   * @param {Number} n
   * @param {object} opts (optional: advanced options)
   * @param {string} opts.network[='livenet']
   * @param {string} opts.parentAddress - A required parent address to enable this address on the network.
   * @param {String} opts.walletPrivKey - set a walletPrivKey (instead of random)
   * @param {String} opts.id - set a id for wallet (instead of server given)
   * @param cb
   * @return {undefined}
   */
  createWallet(walletName: string, copayerName: string, m: number, n: number, opts: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {

      if (!this._checkKeyDerivation()) return reject(new Error('Cannot create new wallet'));

      if (opts) $.shouldBeObject(opts);

      let network = opts.network || ENV.network;
      if (!_.includes(['testnet', 'livenet'], network)) return reject(new Error('Invalid network'));

      if (!this.credentials) {
        this.log.info('Generating new keys');
        this.seedFromRandom({
          network: network
        });
      } else {
        this.log.info('Using existing keys');
      }

      if (network != this.credentials.network) {
        return reject(new Error('Existing keys were created for a different network'));
      }

      const walletPrivKey = opts.walletPrivKey || new Bitcore.PrivateKey(void 0, network);
      const pubkey = walletPrivKey.toPublicKey();
      this.credentials.addWalletPrivateKey(walletPrivKey.toString());
      let address = this.getRootAddress();

      const referralOpts = {
        parentAddress: opts.parentAddress,
        address: address.toString(),
        pubkey: pubkey.toString(),
        addressType: Bitcore.Address.PayToPublicKeyHashType,
        signPrivKey: walletPrivKey,
        network: network,
        alias: opts.alias
      };

      // Create wallet
      return this.sendReferral(referralOpts).then(refid => {

        let c = this.credentials;
        let encWalletName = Utils.encryptMessage(walletName, c.sharedEncryptingKey);

        let args = {
          name: encWalletName,
          m: m,
          n: n,
          pubKey: pubkey.toString(),
          network: network,
          singleAddress: true, //daedalus wallets are single-addressed
          id: opts.id,
          parentAddress: opts.parentAddress,
          referralId: refid
        };

        return this._doPostRequest('/v1/wallets/', args).then(res => {
          if (res) {
            let walletId = res.walletId;
            c.addWalletInfo(walletId, walletName, m, n, copayerName, opts.parentAddress);

            let secret = this._buildSecret(c.walletId, c.walletPrivKey, c.network);

            return this.doJoinWallet(walletId, walletPrivKey, c.xPubKey, c.requestPubKey, copayerName, {}).then(
              wallet => {
                return resolve(n > 1 ? secret : null);
              }
            );
          } else {
            return reject(Error(res));
          }
        });
      }).catch(reject);
    });
  };

  /**
   * Broadcast raw referral to network
   * @param {Object} opts
   * @param {string} opts.parentAddress    - parent address that referrs new address
   * @param {string} opts.address          - (optional) address to beacon
   * @param {number} opts.addressType      - address type: 1 - pubkey, 2 - sript, 3 - parameterizedscript
   * @param {PrivateKey} opts.signPrivKey  - private key to sign referral
   * @param {string} opts.pubkey        - (optional) pubkey of beaconing address. omitted for script
   * @param {string} opts.network          - (optional) network
   * @param {string} opts.alias          - (optional) Address alias
   */
  async sendReferral(opts: any = {}): Promise<any> {
    if (opts) {
      $.shouldBeObject(opts);
    }

    let network = opts.network || ENV.network;;
    if (!_.includes(['testnet', 'livenet'], network)) {
      throw Error('Invalid network');
    }

    if (network != this.credentials.network) {
      throw Error('Existing keys were created for a different network');
    }

    if (!this.credentials) {
      this.log.info('Generating new keys');
      this.seedFromRandom({
        network: network
      });
    } else {
      this.log.info('Using existing keys');
    }

    let parentAddress = opts.parentAddress;

    try {
      Bitcore.encoding.Base58Check.decode(opts.parentAddress);
    } catch (e) {
      if (!Bitcore.Referral.validateAlias(opts.parentAddress)) {
        throw Error('Invalid invite code or alias');
      }

      const parentReferral = await this._doGetRequest(`/v1/referral/${opts.parentAddress}`);
      parentAddress = parentReferral.parentAddress;
    }

    const hash = Bitcore.crypto.Hash.sha256sha256(Buffer.concat([
      Bitcore.Address.fromString(parentAddress, network.name).toBufferLean(),
      Bitcore.Address.fromString(opts.address, network.name).toBufferLean(),
    ]));

    const signature = Bitcore.crypto.ECDSA.sign(hash, opts.signPrivKey, 'big').toString('hex');

    const referral = new Bitcore.Referral({
      parentAddress,
      address: opts.address,
      addressType: opts.addressType,
      pubkey: opts.pubkey,
      signature: signature.toString('hex'),
      alias: opts.alias
    }, network);

    return this._doPostRequest('/v1/referral/', { referral: referral.serialize() });
  };
  /**
   * Join an existing wallet
   *
   * @param {String} secret
   * @param {String} copayerName
   * @param {Object} opts
   * @param {Boolean} opts.dryRun[=false] - Simulate wallet join
   * @returns {Promise}
   */

  joinWallet(secret: string, copayerName: string, opts: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this._checkKeyDerivation()) return reject(new Error('Cannot join wallet'));

      let secretData = this.parseSecret(secret);
      if (!this.credentials) {
        this.seedFromRandom({
          network: secretData.network
        });
      }
      this.credentials.addWalletPrivateKey(secretData.walletPrivKey.toString());
      return this.doJoinWallet(secretData.walletId, secretData.walletPrivKey, this.credentials.xPubKey, this.credentials.requestPubKey, copayerName, {
        dryRun: !!opts.dryRun,
      }).then((wallet) => {
        if (!opts.dryRun) {
          this.credentials.addWalletInfo(wallet.id, wallet.name, wallet.m, wallet.n, copayerName, wallet.parentAddress);
        }
        return resolve(wallet);
      }).catch((ex) => {
        return reject(ex);
      });
    });
  }

  /**
   * Recreates a wallet, given credentials (with wallet id)
   */
  recreateWallet(c: any): Promise<any> {
    $.checkState(this.credentials);
    $.checkState(this.credentials.isComplete());
    $.checkState(this.credentials.walletPrivKey);
    //$.checkState(this.credentials.hasWalletInfo());

    // First: Try to get the wallet with current credentials
    return this.getStatus({
      includeExtendedInfo: true
    }).then(() => {
      let c = this.credentials;
      let walletPrivKey = Bitcore.PrivateKey.fromString(c.walletPrivKey);
      let walletId = c.walletId;
      let supportBIP44AndP2PKH = c.derivationStrategy != Constants.DERIVATION_STRATEGIES.BIP45;
      let encWalletName = Utils.encryptMessage(c.walletName || 'recovered wallet', c.sharedEncryptingKey);

      let args = {
        name: encWalletName,
        m: c.m,
        n: c.n,
        pubKey: walletPrivKey.toPublicKey().toString(),
        network: c.network,
        id: walletId,
        supportBIP44AndP2PKH: supportBIP44AndP2PKH,
        beacon: c.beacon
      };


      return this._doPostRequest('/v1/wallets/', args).then((body) => {
        if (!walletId) {
          walletId = body.walletId;
        }
        return this.addAccess({});
      }).then(() => {
        return this.openWallet();
      }).then(() => {
        let i = 1;
        return Promise.all(this.credentials.publicKeyRing.map((item: any) => {
              let name = item.copayerName || ('copayer ' + i++);
              return this.doJoinWallet(walletId, walletPrivKey, item.xPubKey, item.requestPubKey, name, {
                  supportBIP44AndP2PKH: supportBIP44AndP2PKH
              });
          }));
      });
    });
  };

  private _processWallet(wallet): Promise<any> {
    return new Promise((resolve, reject) => {

      let encryptingKey = this.credentials.sharedEncryptingKey;

      let name = Utils.decryptMessage(wallet.name, encryptingKey);
      if (name != wallet.name) {
        wallet.encryptedName = wallet.name;
      }
      wallet.name = name;
      _.each(wallet.copayers, function (copayer) {
        let name = Utils.decryptMessage(copayer.name, encryptingKey);
        if (name != copayer.name) {
          copayer.encryptedName = copayer.name;
        }
        copayer.name = name;
        _.each(copayer.requestPubKeys, function (access) {
          if (!access.name) return;

          let name = Utils.decryptMessage(access.name, encryptingKey);
          if (name != access.name) {
            access.encryptedName = access.name;
          }
          access.name = name;
        });
      });
      //TODO: Is there a better way to be sure we've waited for any I/O?
      return resolve();
    });
  };

  private _processStatus = (status): Promise<any> => {

    let processCustomData = (data): Promise<any> => {
      return new Promise((resolve, reject) => {

        let copayers = data.wallet.copayers;
        if (!copayers) return resolve();

        let me: any = _.find(copayers, {
          'id': this.credentials.copayerId
        });
        if (!me || !me.customData) return resolve();

        let customData;
        try {
          customData = JSON.parse(Utils.decryptMessage(me.customData, this.credentials.personalEncryptingKey));
        } catch (e) {
          this.log.warn('Could not decrypt customData:', me.customData);
        }
        if (!customData) return resolve();


        // Update walletPrivateKey
        if (!this.credentials.walletPrivKey && customData.walletPrivKey) {
          this.credentials.addWalletPrivateKey(customData.walletPrivKey);
        }

        // Add it to result
        return resolve(data.customData = customData);
      });
    };

    let processConfirmStatus = (status) => {
        this.confirmed = (status.invitesBalance && status.invitesBalance.totalConfirmedAmount > 0);
    };

    // Resolve all our async calls here, then resolve this wrapping promise.
    return Promise.all([
      processCustomData(status),
      this._processWallet(status.wallet),
      this._processTxps(status.pendingTxps),
      processConfirmStatus(status)
    ]).then(() => {
      return Promise.resolve();
    });
  }


  /**
   * Get latest notifications
   *
   * @param {object} opts
   * @param {String} opts.lastNotificationId (optional) - The ID of the last received notification
   * @param {String} opts.timeSpan (optional) - A time window on which to look for notifications (in seconds)
   * @param {String} opts.includeOwn[=false] (optional) - Do not ignore notifications generated by the current copayer
   * @returns {Callback} cb - Returns error or an array of notifications
   */
  // TODO: Make this return a promise of []Notifications
  getNotifications(opts: any = {}): Promise<any> {
    $.checkState(this.credentials);

    let url = '/v1/notifications/';
    if (opts.lastNotificationId) {
      url += '?notificationId=' + opts.lastNotificationId;
    } else if (opts.timeSpan) {

      url += '?timeSpan=' + opts.timeSpan;
    }

    return this._doGetRequestWithLogin(url).then((result) => {
      let notifications = _.filter(result, function (notification: any) {
        return opts.includeOwn || (notification.creatorId != this.credentials.copayerId);
      });

      return notifications;
    });
  };

  /**
   * Get status of the wallet
   *
   * @param {Boolean} opts.twoStep[=false] - Optional: use 2-step balance computation for improved performance
   * @param {Boolean} opts.includeExtendedInfo (optional: query extended status)
   * @returns {Callback} cb - Returns error or an object with status information
   */
  getStatus(opts: any = {}): Promise<any> {
    $.checkState(this.credentials);
    let qs = [];
    qs.push('includeExtendedInfo=' + (opts.includeExtendedInfo ? '1' : '0'));
    qs.push('twoStep=' + (opts.twoStep ? '1' : '0'));

    return this._doGetRequest('/v1/wallets/?' + qs.join('&')).then((result) => {
      if (result.wallet.status == 'pending') {
        let c = this.credentials;
        result.wallet.secret = this._buildSecret(c.walletId, c.walletPrivKey, c.network);
      }

      return this._processStatus(result).then(() => {
        return Promise.resolve(result);
      });
    });
  };

  getANV(addr: any): Promise<any> {
    $.checkState(this.credentials);

    let keys = [addr];
    let network = this.credentials.network;

    return this._doGetRequest('/v1/anv/?network=' + network + '&keys=' + keys.join(','));
  }

  getRewards(address: any): Promise<any> {
    $.checkState(this.credentials);
    let addresses = [address];
    let network = this.credentials.network;
    return this._doGetRequest('/v1/rewards/?network=' + network + '&addresses=' + addresses.join(','));
  }

  /**
   * Get copayer preferences
   */
  getPreferences(): Promise<any> {
    $.checkState(this.credentials);

    return this._doGetRequest('/v1/preferences/');
  };

  /**
   * Save copayer preferences
   *
   * @param {Object} preferences
   */
  savePreferences(preferences: any): Promise<any> {
    $.checkState(this.credentials);

    return this._doPutRequest('/v1/preferences/', preferences);
  };


  /**
   * fetchPayPro
   *
   * @param opts.payProUrl  URL for paypro request
   * @returns {Callback} cb - Return error or the parsed payment protocol request
   * Returns (err,paypro)
   *  paypro.amount
   *  paypro.toAddress
   *  paypro.memo
   */
  // TODO: Promisify (if we keep PayPro functionality.)
  fetchPayPro(opts: any): Promise<any> {
    $.checkArgument(opts)
      .checkArgument(opts.payProUrl);

    return PayPro.get({
      url: opts.payProUrl,
      http: this.payProHttp,
    }).then((paypro) => {
      return Promise.resolve(paypro);
    });
  };

  /**
   * Gets list of utxos
   *
   * @param {Function} cb
   * @param {Object} opts
   * @param {Array} opts.addresses (optional) - List of addresses from where to fetch UTXOs.
   */
  getUtxos(opts: any = {}): Promise<any> {
    $.checkState(this.credentials && this.credentials.isComplete());
    let url = '/v1/utxos/';

    if (opts.addresses) {
      url += '?' + querystring.stringify({
        addresses: [].concat(opts.addresses).join(','),
        invites: opts.invites,
      });
    }
    return this._doGetRequest(url);
  };

  _getCreateTxProposalArgs(opts: any): any {
    let args = _.cloneDeep(opts);
    args.message = this._encryptMessage(opts.message, this.credentials.sharedEncryptingKey) || null;
    args.payProUrl = opts.payProUrl || null;
    _.each(args.outputs, (o) => {
      o.message = this._encryptMessage(o.message, this.credentials.sharedEncryptingKey) || null;
    });

    return args;
  };

  /**
   * Create a transaction proposal
   *
   * @param {Object} opts
   * @param {string} opts.txProposalId - Optional. If provided it will be used as this TX proposal ID. Should be unique in the scope of the wallet.
   * @param {Array} opts.outputs - List of outputs.
   * @param {string} opts.outputs[].toAddress - Destination address.
   * @param {number} opts.outputs[].amount - Amount to transfer in micro.
   * @param {string} opts.outputs[].message - A message to attach to this output.
   * @param {string} opts.message - A message to attach to this transaction.
   * @param {number} opts.feeLevel[='normal'] - Optional. Specify the fee level for this TX ('priority', 'normal', 'economy', 'superEconomy').
   * @param {number} opts.feePerKb - Optional. Specify the fee per KB for this TX (in micro).
   * @param {string} opts.changeAddress - Optional. Use this address as the change address for the tx. The address should belong to the wallet. In the case of singleAddress wallets, the first main address will be used.
   * @param {Boolean} opts.sendMax - Optional. Send maximum amount of funds that make sense under the specified fee/feePerKb conditions. (defaults to false).
   * @param {string} opts.payProUrl - Optional. Paypro URL for peers to verify TX
   * @param {Boolean} opts.excludeUnconfirmedUtxos[=false] - Optional. Do not use UTXOs of unconfirmed transactions as inputs
   * @param {Boolean} opts.validateOutputs[=true] - Optional. Perform validation on outputs.
   * @param {Boolean} opts.dryRun[=false] - Optional. Simulate the action but do not change server state.
   * @param {Array} opts.inputs - Optional. Inputs for this TX
   * @param {number} opts.fee - Optional. Use an fixed fee for this TX (only when opts.inputs is specified)
   * @param {Boolean} opts.noShuffleOutputs - Optional. If set, TX outputs won't be shuffled. Defaults to false
   * @returns {Callback} - Return error or the transaction proposal
   */
  createTxProposal(opts: any): Promise<any> {
    $.checkState(this.credentials && this.credentials.isComplete());
    $.checkState(this.credentials.sharedEncryptingKey);
    $.checkArgument(opts);

    let args = this._getCreateTxProposalArgs(opts);
    return this._doPostRequest('/v1/txproposals/', args).then((txp) => {

      console.log('@@@TXP', txp);

      if (!txp) {
        return Promise.reject(new Error("Could not get transaction proposal from server."));
      }
      if (txp.code && txp.code == "INSUFFICIENT_FUNDS") {
        return Promise.reject(MWCErrors.INSUFFICIENT_FUNDS);
      }
      return this._processTxps(txp).then(() => {

        if (!Verifier.checkProposalCreation(args, txp, this.credentials.sharedEncryptingKey, opts.sendMax)) {
          return Promise.reject(MWCErrors.SERVER_COMPROMISED);
        }
        return Promise.resolve(txp);
      });
    });
  };

  /**
   * Publish a transaction proposal
   *
   * @param {Object} opts
   * @param {Object} opts.txp - The transaction proposal object returned by the API#createTxProposal method
   * @returns {Callback} cb - Return error or null
   */
  publishTxProposal(opts: any): Promise<any> {
    $.checkState(this.credentials && this.credentials.isComplete(), 'no authorization data');
    $.checkArgument(opts)
    $.checkArgument(opts.txp, 'txp is required');

    $.checkState(parseInt(opts.txp.version) >= Bitcore.Transaction.CURRENT_VERSION);

    let t = Utils.buildTx(opts.txp);
    let hash = t.uncheckedSerialize();
    let args = {
      proposalSignature: Utils.signMessage(hash, this.credentials.requestPrivKey)
    };

    let url = '/v1/txproposals/' + opts.txp.id + '/publish/';
    return this._doPostRequest(url, args).then((txp) => {
      return txp;
    }).catch((err) => {
      return Promise.reject(new Error('error in post /v1/txproposals/' + err));
    });
  };

  /**
   * Send signed referral to beacon address and unlock in MWS
   * @param {Referral} opts
   */
  signAddressAndUnlock(opts: any = {}): Promise<any> {
    return this.sendReferral(opts).then((refid: string) =>
      this._doPostRequest('/v1/addresses/unlock/', { address: opts.address, parentAddress: opts.parentAddress, refid })
        .then(() => refid)
    );
  };

  /**
   * Sign and unlock address with root wallet address if it's not beaconed yet
   * @param {Address} address Address object to sign and beacon
   */
  signAddressAndUnlockWithRoot(address: any): Promise<any> {
    $.checkState(this.credentials && this.credentials.isComplete());
    if (address.signed) {
      return Promise.resolve(address.refid);
    }

    // try to sign address and unlock it
    // getDerivedXPrivKey gives a key derived from xPrivKey to get corresponging privkey to pubkey by path
    const signPrivKey = this.credentials.getDerivedXPrivKey('').deriveChild(address.path).privateKey;

    const unlockOpts = {
      // privKey.toPublicKey().toAddress() and privKey.toAddress() gives two different strings, but daemon treats them as same string ???
      parentAddress: Bitcore.PrivateKey(this.credentials.walletPrivKey, this.credentials.network).toPublicKey().toAddress().toString(),
      address: address.address,
      pubkey: address.publicKeys[0],
      addressType: 1,
      signPrivKey,
      network: address.network,
    };

    return this.signAddressAndUnlock(unlockOpts);
  }

  /**
   * Create a new address
   *
   * @param {Object} opts
   * @param {Boolean} opts.ignoreMaxGap[=false]
   * @param {Callback} cb
   * @returns {Callback} cb - Return error or the address
   */
  createAddress(opts: any = {}): Promise<any> {
    $.checkState(this.credentials && this.credentials.isComplete());

    return new Promise((resolve, reject) => {
      if (!this._checkKeyDerivation()) return reject(new Error('Cannot create new address for this wallet'));

      opts.ignoreMaxGap = true;
      return this._doPostRequest('/v1/addresses/', opts).then((address) => {
        if (!Verifier.checkAddress(this.credentials, address)) {
          return reject(MWCErrors.SERVER_COMPROMISED);
        }
        if (!address.signed) {
          return this.signAddressAndUnlockWithRoot(address)
            .then(() => resolve(address));
        } else {
          return resolve(address);
        }

      });
    });
  };

  /**
   * Adds access to the current copayer
   * @param {Object} opts
   * @param {bool} opts.generateNewKey Optional: generate a new key for the new access
   * @param {string} opts.restrictions
   *    - cannotProposeTXs
   *    - cannotXXX TODO
   * @param {string} opts.name  (name for the new access)
   *
   * return the accesses Wallet and the requestPrivateKey
   */
  addAccess(opts: any = {}): Promise<any> {
    $.checkState(this.credentials && this.credentials.canSign());

    let reqPrivKey = new Bitcore.PrivateKey(opts.generateNewKey ? null : this.credentials.requestPrivKey);
    let requestPubKey = reqPrivKey.toPublicKey().toString();

    let xPriv = new Bitcore.HDPrivateKey(this.credentials.xPrivKey)
      .deriveChild(this.credentials.getBaseAddressDerivationPath());
    let sig = Utils.signRequestPubKey(requestPubKey, xPriv);
    let copayerId = this.credentials.copayerId;

    let encCopayerName = opts.name ? Utils.encryptMessage(opts.name, this.credentials.sharedEncryptingKey) : null;

    opts = {
      copayerId: copayerId,
      requestPubKey: requestPubKey,
      signature: sig,
      name: encCopayerName,
      restrictions: opts.restrictions,
    };

    return this._doPutRequest('/v1/copayers/' + copayerId + '/', opts);
  };

  // Ensure that an address is in a valid format, and that it has been beaconed on the blockchain.
  validateAddress(address: string): Promise<any> {
    const url = `/v1/addresses/${address}/validate/`;
    return this._doGetRequest(url);
  };


  /**
   * Get your main addresses
   *
   * @param {Object} opts
   * @param {Boolean} opts.doNotVerify
   * @param {Numeric} opts.limit (optional) - Limit the resultset. Return all addresses by default.
   * @param {Boolean} [opts.reverse=false] (optional) - Reverse the order of returned addresses.
   */
  getMainAddresses(opts: any = {}): Promise<any> {
    $.checkState(this.credentials && this.credentials.isComplete());
    let args = [];
    if (opts.limit) args.push('limit=' + opts.limit);
    if (opts.reverse) args.push('reverse=1');
    let qs = '';
    if (args.length > 0) {
      qs = '?' + args.join('&');
    }
    let url = '/v1/addresses/' + qs;

    return new Promise((resolve, reject) => {
      return this._doGetRequest(url).then((addresses) => {
        if (!opts.doNotVerify) {
          let fake = _.some(addresses, (address) => {
            return !Verifier.checkAddress(this.credentials, address);
          });
          if (fake) {
            return reject(MWCErrors.SERVER_COMPROMISED);
          }
        }
        return resolve(addresses);
      });
    });
  };

  /**
   * Update wallet balance
   *
   * @param {Boolean} opts.twoStep[=false] - Optional: use 2-step balance computation for improved performance
   */
  getBalance(opts: any = {}): Promise<number> {
    $.checkState(this.credentials && this.credentials.isComplete());
    let url = '/v1/balance/';
    if (opts.twoStep) url += '?twoStep=1';

    return this._doGetRequest(url).then(balance => balance.availableAmount);
  };

  /**
   * Update wallet invites balance
   */
  getInvitesBalance(opts: any = {}): Promise<number> {
    $.checkState(this.credentials && this.credentials.isComplete());
    let url = '/v1/invites/';

    return this._doGetRequest(url);
  };

  /**
   * Get list of transactions proposals
   *
   * @param {Object} opts
   * @param {Boolean} opts.doNotVerify
   * @param {Boolean} opts.forAirGapped
   * @param {Boolean} opts.doNotEncryptPkr
   * @return {Callback} cb - Return error or array of transactions proposals
   */
  getTxProposals(opts: any): Promise<any> {
    $.checkState(this.credentials && this.credentials.isComplete());


    return this._doGetRequest('/v1/txproposals/').then((txps) => {
      return this._processTxps(txps).then(() => {
        return Promise.all(txps.map(async (txp) => {
            if (!opts.doNotVerify) {
                // TODO: Find a way to run this check in parallel.
                return this.getPayPro(txp).then((paypro) => {
                    if (!Verifier.checkTxProposal(this.credentials, txp, {
                            paypro: paypro,
                        })) {
                        Promise.reject(MWCErrors.SERVER_COMPROMISED);
                    }
                });
            }
        })).then(() => {
          let result: any;
          if (opts.forAirGapped) {
            result = {
              txps: JSON.parse(JSON.stringify(txps)),
              encryptedPkr: opts.doNotEncryptPkr ? null : Utils.encryptMessage(JSON.stringify(this.credentials.publicKeyRing), this.credentials.personalEncryptingKey),
              unencryptedPkr: opts.doNotEncryptPkr ? JSON.stringify(this.credentials.publicKeyRing) : null,
              m: this.credentials.m,
              n: this.credentials.n,
            };
          } else {
            result = txps;
          }
          Promise.resolve(result);
        });
      });
    });
  };

  //TODO: Refactor Paypro module to be Promisified.
  private getPayPro(txp): Promise<any> {
    if (!txp.payProUrl || this.doNotVerifyPayPro)
      return Promise.resolve();

    return PayPro.get({
      url: txp.payProUrl,
      http: this.payProHttp,
    }).then((paypro) => {
      if (!paypro) {
        return Promise.reject(new Error('Cannot check paypro transaction now.'));
      }
      return Promise.resolve(paypro);
    });
  };

  /**
  * Sign a transaction proposal
  *
  * @param {Object} txp
  * @param {String} password - (optional) A password to decrypt the encrypted private key (if encryption is set).
  */
  signTxProposal(txp: any, password: string): Promise<any> {
    return new Promise((resolve, reject) => {
      $.checkState(this.credentials && this.credentials.isComplete());
      $.checkArgument(txp.creatorId);

      if (!txp.signatures) {
        if (!this.canSign())
          return reject(MWCErrors.MISSING_PRIVATE_KEY);

        if (this.isPrivKeyEncrypted() && !password)
          return reject(MWCErrors.ENCRYPTED_PRIVATE_KEY);
      }

      return this.getPayPro(txp).then((paypro) => {
        let isLegit = Verifier.checkTxProposal(this.credentials, txp, {
          paypro: paypro,
        });

        if (!isLegit)
          return reject(MWCErrors.SERVER_COMPROMISED);

        let signatures = txp.signatures;

        if (_.isEmpty(signatures)) {
          signatures = this._signTxp(txp, password);
        }

        let url = '/v1/txproposals/' + txp.id + '/signatures/';
        let args = {
          signatures: signatures
        };

        return this._doPostRequest(url, args).then((txp) => {
          return this._processTxps(txp).then(() => {
            return resolve(txp);
          });
        });
      });
    });
  }

  /**
   * Sign transaction proposal from AirGapped
   *
   * @param {Object} txp
   * @param {String} encryptedPkr
   * @param {Number} m
   * @param {Number} n
   * @param {String} password - (optional) A password to decrypt the encrypted private key (if encryption is set).
   * @return {Object} txp - Return transaction
   */
  signTxProposalFromAirGapped(txp: any, encryptedPkr: string, m: number, n: number, password: string): Promise<any> {
    $.checkState(this.credentials);
    if (!this.canSign())
      throw MWCErrors.MISSING_PRIVATE_KEY;

    if (this.isPrivKeyEncrypted() && !password)
      throw MWCErrors.ENCRYPTED_PRIVATE_KEY;

    let publicKeyRing;
    try {
      publicKeyRing = JSON.parse(Utils.decryptMessage(encryptedPkr, this.credentials.personalEncryptingKey));
    } catch (ex) {
      throw new Error('Could not decrypt public key ring');
    }

    if (!_.isArray(publicKeyRing) || publicKeyRing.length != n) {
      throw new Error('Invalid public key ring');
    }

    this.credentials.m = m;
    this.credentials.n = n;
    this.credentials.addressType = txp.addressType;
    this.credentials.addPublicKeyRing(publicKeyRing);

    if (!Verifier.checkTxProposalSignature(this.credentials, txp))
      throw new Error('Fake transaction proposal');

    return this._signTxp(txp, password);
  };


  /**
   * Reject a transaction proposal
   *
   * @param {Object} txp
   * @param {String} reason
   */
  rejectTxProposal(txp: any, reason: any): Promise<any> {
    $.checkState(this.credentials && this.credentials.isComplete());

    let url = '/v1/txproposals/' + txp.id + '/rejections/';
    let args = {
      reason: this._encryptMessage(reason, this.credentials.sharedEncryptingKey) || '',
    };
    return this._doPostRequest(url, args).then((txp) => {
      return this._processTxps(txp).then(() => {
        return Promise.resolve(txp);
      });
    });
  }

  /**
 * Broadcast raw transaction
 *
 * @param {Object} opts
 * @param {String} opts.network
 * @param {String} opts.rawTx
 * @param {Callback} cb
 * @return {Callback} cb - Return error or txid
 */
  broadcastRawTx(opts: any = {}): Promise<any> {
    $.checkState(this.credentials);
    opts = opts || {};

    let url = '/v1/broadcast_raw/';
    return this._doPostRequest(url, opts);
  };

  private _doBroadcast(txp): Promise<any> {
    let url = '/v1/txproposals/' + txp.id + '/broadcast/';
    return this._doPostRequest(url, {}).then((txp) => {
      return this._processTxps(txp).then(() => {
        return Promise.resolve(txp);
      });
    });
  };

  /**
  * Broadcast a transaction proposal
  *
  * @param {Object} txp
  * @param {Callback} cb
  * @return {Callback} cb - Return error or object
  */
  broadcastTxProposal(txp): Promise<any> {
    this.log.warn("Inside broadCastTxProposal");
    $.checkState(this.credentials && this.credentials.isComplete());

    return this.signAddressAndUnlockWithRoot(txp.changeAddress)
      .then(() => {
        return this.getPayPro(txp).then((paypro) => {
          if (paypro) {
            this.log.warn("WE ARE PAYPRO");
            let t = Utils.buildTx(txp);
            this._applyAllSignatures(txp, t);

            return PayPro.send({
              http: this.payProHttp,
              url: txp.payProUrl,
              amountMicros: txp.amount,
              refundAddr: txp.changeAddress.address,
              merchant_data: paypro.merchant_data,
              rawTx: t.serialize({
                disableSmallFees: true,
                disableLargeFees: true,
                disableDustOutputs: true
              }),
            });
          }
          return Promise.resolve();
        }).then(() => {
          return this._doBroadcast(txp);
        });
      });
  };

  /**
   * Remove a transaction proposal
   *
   * @param {Object} txp
   * @param {Callback} cb
   * @return {Callback} cb - Return error or empty
   */
  removeTxProposal(txp: any): Promise<any> {
    $.checkState(this.credentials && this.credentials.isComplete());

    let url = '/v1/txproposals/' + txp.id;
    return this._doDeleteRequest(url);
  };

  /**
   * Get transaction history
   *
   * @param {Object} opts
   * @param {Number} opts.skip (defaults to 0)
   * @param {Number} opts.limit
   * @param {Boolean} opts.includeExtendedInfo
   * @param {Callback} cb
   * @return {Callback} cb - Return error or array of transactions
   */
  getTxHistory(opts: any): Promise<any> {
    $.checkState(this.credentials && this.credentials.isComplete());

    let args = [];
    if (opts) {
      if (opts.skip) args.push('skip=' + opts.skip);
      if (opts.limit) args.push('limit=' + opts.limit);
      if (opts.includeExtendedInfo) args.push('includeExtendedInfo=1');
    }
    let qs = '';
    if (args.length > 0) {
      qs = '?' + args.join('&');
    }

    let url = '/v1/txhistory/' + qs;
    return this._doGetRequest(url).then((txs) => {
     return this._processTxps(txs).then(() => {

       return Promise.resolve(txs);
     });
    });
  };

  /**
   * Get invite requests
   *
   */
  getInvitesHistory() :Promise<any> {

    return Promise.resolve([
      {
        "txid": "b0c6f7cb2f57c4ab3a6219f0843b6bb3388b7159a0face3d07cdd73721b4e9cc",
        "action": "unlock",
        "amount": 1,
        "time": 1516968822,
        "confirmations": 0,
        "outputs": [
          {
            "amount": 1,
            "address": "mRLJYVyq2uyzJf1StCEFV5Y86RjuFtCTBc"
          }
        ]
      }
    ]);

  }

  /**
   *
   * @param address
   */
  confirmRequest(request:{refid:string, address:string}): Promise<any> {
    return Promise.resolve(true);
  }

  /**
   * gets all unlock requests (active and hidden) for this wallet
   *
   */
  getUnlockRequests(): Promise<any> {
    $.checkState(this.credentials && this.credentials.isComplete());

    let url = '/v1/unlockrequests/';
    return this._doGetRequest(url);
  }


  /**
   * getTx
   *
   * @param {String} TransactionId
   * @return {Callback} cb - Return error or transaction
   */
  getTx(id: any): Promise<any> {
    $.checkState(this.credentials && this.credentials.isComplete());

    let url = '/v1/txproposals/' + id;
    return this._doGetRequest(url).then((txp) => {
      this._processTxps(txp).then(() => {
        return Promise.resolve();
      });
    });
  };

  /**
   * Start an address scanning process.
   * When finished, the scanning process will send a notification 'ScanFinished' to all copayers.
   *
   * @param {Object} opts
   * @param {Boolean} opts.includeCopayerBranches (defaults to false)
   * @param {Callback} cb
   */
  startScan(opts: any = {}): Promise<any> {
    $.checkState(this.credentials && this.credentials.isComplete());
    let args = {
      includeCopayerBranches: opts.includeCopayerBranches,
    };
    return this._doPostRequest('/v1/addresses/scan', args);
  };

  /**
   * Get a note associated with the specified txid
   * @param {Object} opts
   * @param {string} opts.txid - The txid to associate this note with
   */
  getTxNote(opts: any = {}): Promise<any> {
    $.checkState(this.credentials);
    return this._doGetRequest('/v1/txnotes/' + opts.txid + '/').then((note) => {
      this._processTxNotes(note);
      return Promise.resolve();
    });
  }


  /**
   * Edit a note associated with the specified txid
   * @param {Object} opts
   * @param {string} opts.txid - The txid to associate this note with
   * @param {string} opts.body - The contents of the note
   */
  editTxNote(opts: any = {}): Promise<any> {
    $.checkState(this.credentials);
    if (opts.body) {
      opts.body = this._encryptMessage(opts.body, this.credentials.sharedEncryptingKey);
    }
    return this._doPutRequest('/v1/txnotes/' + opts.txid + '/', opts).then((note) => {
      this._processTxNotes(note);
      return Promise.resolve();
    });
  };

  /**
   * Get all notes edited after the specified date
   * @param {Object} opts
   * @param {string} opts.minTs - The starting timestamp
   */
  getTxNotes(opts: any = {}): Promise<any> {
    $.checkState(this.credentials);
    let args = [];
    if (_.isNumber(opts.minTs)) {
      args.push('minTs=' + opts.minTs);
    }
    let qs = '';
    if (args.length > 0) {
      qs = '?' + args.join('&');
    }

    return this._doGetRequest('/v1/txnotes/' + qs).then((notes) => {
      return Promise.resolve(this._processTxNotes(notes));
    });
  }

  /**
   * Returns exchange rate for the specified currency & timestamp.
   * @param {Object} opts
   * @param {string} opts.code - Currency ISO code.
   * @param {Date} [opts.ts] - A timestamp to base the rate on (default Date.now()).
   * @param {String} [opts.provider] - A provider of exchange rates (default 'BitPay').
   * @returns {Object} rates - The exchange rate.
   */
  getFiatRate(opts: any = {}): Promise<any> {
    $.checkState(this.credentials);
    let args = [];
    if (opts.ts) args.push('ts=' + opts.ts);
    if (opts.provider) args.push('provider=' + opts.provider);
    let qs = '';
    if (args.length > 0) {
      qs = '?' + args.join('&');
    }

    return this._doGetRequest('/v1/fiatrates/' + opts.code + '/' + qs);
  }

  /**
   * Subscribe to push notifications.
   * @param {Object} opts
   * @param {String} opts.type - Device type (ios or android).
   * @param {String} opts.token - Device token.
   * @returns {Object} response - Status of subscription.
   */
  pushNotificationsSubscribe(opts: any): Promise<any> {
    let url = '/v1/pushnotifications/subscriptions/';
    return this._doPostRequest(url, opts);
  };

  /**
   * Unsubscribe from push notifications.
   * @param {String} token - Device token
   * @return {Callback} cb - Return error if exists
   */
  pushNotificationsUnsubscribe(token: string): Promise<any> {
    let url = '/v1/pushnotifications/subscriptions/' + token;
    return this._doDeleteRequest(url);
  };

  /**
   * Listen to a tx for its first confirmation.
   * @param {Object} opts
   * @param {String} opts.txid - The txid to subscribe to.
   * @returns {Object} response - Status of subscription.
   */
  txConfirmationSubscribe(opts: any): Promise<any> {
    let url = '/v1/txconfirmations/';
    return this._doPostRequest(url, opts);
  };

  /**
   * Stop listening for a tx confirmation.
   * @param {String} txid - The txid to unsubscribe from.
   */
  txConfirmationUnsubscribe(txid: string): Promise<any> {
    let url = '/v1/txconfirmations/' + txid;
    return this._doDeleteRequest(url);
  };

  /**
   * Returns send max information.
   * @param {String} opts
   * @param {number} opts.feeLevel[='normal'] - Optional. Specify the fee level ('priority', 'normal', 'economy', 'superEconomy').
   * @param {number} opts.feePerKb - Optional. Specify the fee per KB (in micro).
   * @param {Boolean} opts.excludeUnconfirmedUtxos - Indicates it if should use (or not) the unconfirmed utxos
   * @param {Boolean} opts.returnInputs - Indicates it if should return (or not) the inputs
   */
  public getSendMaxInfo(opts: any = {}): Promise<any> {
    let args = [];

    if (opts.feeLevel) args.push('feeLevel=' + opts.feeLevel);
    if (opts.feePerKb) args.push('feePerKb=' + opts.feePerKb);
    if (opts.excludeUnconfirmedUtxos) args.push('excludeUnconfirmedUtxos=1');
    if (opts.returnInputs) args.push('returnInputs=1');
    let qs = '';
    if (args.length > 0)
      qs = '?' + args.join('&');
    let url = '/v1/sendmaxinfo/' + qs;

    return this._doGetRequest(url);
  };

  /**
   * Get wallet status based on a string identifier (one of: walletId, address, txid)
   *
   * @param {string} opts.identifier - The identifier
   * @param {Boolean} opts.twoStep[=false] - Optional: use 2-step balance computation for improved performance
   * @param {Boolean} opts.includeExtendedInfo (optional: query extended status)
   */
  getStatusByIdentifier(opts: any = {}): Promise<any> {
    $.checkState(this.credentials);
    let qs = [];
    qs.push('includeExtendedInfo=' + (opts.includeExtendedInfo ? '1' : '0'));
    qs.push('twoStep=' + (opts.twoStep ? '1' : '0'));

    return this._doGetRequest('/v1/wallets/' + opts.identifier + '?' + qs.join('&')).then((result) => {
      if (!result || !result.wallet) return Promise.reject(new Error('Could not get status by identifier.'));
      if (result.wallet.status == 'pending') {
        let c = this.credentials;
        result.wallet.secret = this._buildSecret(c.walletId, c.walletPrivKey, c.network);
      }
      return this._processStatus(result);
    });
  };

  referralTxConfirmationSubscribe(opts): Promise<any> {
    const url = '/v1/referraltxconfirmations/';
    return this._doPostRequest(url, opts);
  };

  referralTxConfirmationUnsubscribe(codeHash): Promise<any> {
    const url = '/v1/referraltxconfirmations/' + codeHash;
    return this._doDeleteRequest(url);
  }

  /**
   *
   * Checks the blockChain for a valid EasySend transaction that can be unlocked.
   * @param {String} EasyReceiptScript The script of the easySend, generated client side
   * @param cb Callback or handler to manage response from BWS
   * @return {undefined}
   */
  validateEasyScript(scriptId): Promise<EasyReceiptResult> {
    this.log.warn("Validating: " + scriptId);

    let url = '/v1/easyreceive/validate/' + scriptId;
    return this._doGetRequest(url);
  };

  /**
  * Vaulting
  */
  getVaults() {
    $.checkState(this.credentials);

    var url = '/v1/vaults/';
    return this._doGetRequest(url);
  };

  createVault(vault: any) {
    $.checkState(this.credentials);

    var url = '/v1/vaults/';
    return this._doPostRequest(url, vault);
  };

  renewVault(vault: any) {
    $.checkState(this.credentials);

    var url = `/v1/vaults/${vault._id}`;
    return this._doPostRequest(url, vault);
  };

  getVaultCoins(vaultAddress: any) {
    return this.getUtxos({ addresses: [vaultAddress] });
  };

  getVaultTxHistory(vaultId: string, network: string): Promise<Array<any>> {
    $.checkState(this.credentials);

    var url = `/v1/vaults/${vaultId}/txhistory?network=${network}`;
    return this._doGetRequest(url);
  };

  getDefaultFee() {
    return DEFAULT_FEE;
  }
}