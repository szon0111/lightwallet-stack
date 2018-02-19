import { Injectable } from '@angular/core';

import * as _ from 'lodash';
import { BwcService } from 'merit/core/bwc.service';
import { Logger } from 'merit/core/logger';
import { ProfileService } from 'merit/core/profile.service';
import { WalletService } from 'merit/wallets/wallet.service';
import { MeritWalletClient } from './../../../lib/merit-wallet-client';

@Injectable()
export class CreateVaultService {

  private bitcore: any;
  private walletClient: MeritWalletClient;

  private model = {
    vaultName: '',
    whitelist: [],
    amountToDeposit: '0.0',
    amountAvailable: 10000,
    masterKey: null,
    masterKeyMnemonic: '',
    selectedWallet: null
  };

  constructor(private bwcService: BwcService,
              private walletService: WalletService,
              private logger: Logger,
              private profileService: ProfileService,) {
    this.bitcore = this.bwcService.getBitcore();
  }

  updateData(fields: any): void {
    this.model = _.assign({}, this.model, fields);
    this.walletClient = this.model.selectedWallet;
  }

  getData(): any {
    return this.model;
  }

  createVault(): Promise<any> {

    if (_.isEmpty(this.model.whitelist)) {

      return this.walletService.getAddress(this.walletClient, false).then(address => {
        const spendPubKey = this.bitcore.PublicKey.fromString(address.publicKeys[0]);
        return this.vaultFromModel(spendPubKey, []);
      }).then((vault) => {
        this.resetModel();
        return vault;
      });

    } else {

      const wallet = this.model.selectedWallet;
      const signPrivKey = this.bitcore.HDPrivateKey.fromString(wallet.credentials.xPrivKey).privateKey;
      const pubkey = signPrivKey.publicKey;

      return this.vaultFromModel(pubkey, this.model.whitelist).then((vault) => {
        let scriptReferralOpts = {
          parentAddress: wallet.getRootAddress().toString(),
          pubkey: pubkey.toString(),
          signPrivKey,
          address: vault.address.toString(),
          addressType: this.bitcore.Address.ParameterizedPayToScriptHashType, // pubkey address
          network: wallet.network,
        };

        return wallet
          .sendReferral(scriptReferralOpts).then(() => {
            return this.getTxp(vault, false);
          })
          .then(txp => {
            return wallet.sendInvite(scriptReferralOpts.address, 1, vault.scriptPubKey.toBuffer().toString('hex')).then(() => txp);
          })
          .then((txp) => {
            return this.walletService.prepare(wallet).then((password: string) => {
              return { password: password, txp: txp };
            });
          }).then((args: any) => {
            return this.walletService.publishTx(wallet, args.txp).then((pubTxp) => {
              return { password: args.password, txp: pubTxp };
            });
          }).then((args: any) => {
            return this.walletService.signTx(wallet, args.txp, args.password);
          }).then((signedTxp: any) => {
            vault.coins.push(signedTxp);
            return signedTxp;
          }).then((signedTxp) => {
            // return wallet.signAddressAndUnlockWithRoot(signedTxp.changeAddress).then(() => vault);
            return vault;
          }).then(vault => {
            vault.name = this.model.vaultName;
            return wallet.createVault(vault);
          }).then((resp) => {
            return this.profileService.addVault({
              id: vault.address,
              copayerId: wallet.credentials.copayerId,
              name: this.model.vaultName,
            });
          }).then(() => {
            this.resetModel();
          });
      }).catch((err) => {
        this.logger.info('Error while creating vault:', err);
        return Promise.reject(err);
      });
    }
  }

  private resetModel() {

    this.model = {
      vaultName: '',
      whitelist: [],
      amountToDeposit: null,
      amountAvailable: 0,
      masterKey: null,
      masterKeyMnemonic: '',
      selectedWallet: null
    }

  }

  private async vaultFromModel(spendPubKey: any, whitelistedAddresses: Array<any>): Promise<any> {
    //currently only supports type 0 which is a whitelisted vault.
    const amount = this.bitcore.Unit.fromMRT(parseFloat(this.model.amountToDeposit)).toMicros();
    const addrs = await Promise.all(whitelistedAddresses.map(async (w: any) => {
      let address;
      if (w.type == 'wallet') {
        address = this.getAllWallets().then((wallets) => {
          let foundWallet = _.find(wallets, { id: w.id });
          return foundWallet.createAddress().then((resp) => {
            return this.bitcore.Address.fromString(resp.address);
          });
        });
      } else {
        address = Promise.resolve(this.bitcore.Address.fromString(w.address));
      }
      return address;
    }));

    return this.walletClient.prepareVault(0, {
      amount: amount,
      whitelist: _.map(addrs, (addr) => addr.toBuffer()),
      masterPubKey: this.model.masterKey.publicKey,
      spendPubKey: spendPubKey,
    });
  }

  private getTxp(vault: any, dryRun: boolean): Promise<any> {
    this.logger.warn('In GetTXP');
    this.logger.warn(vault);
    this.logger.warn(this.model.selectedWallet);
    return this.findFeeLevel(vault.amount).then((feeLevel) => {
      if (vault.amount > Number.MAX_SAFE_INTEGER) {
        return Promise.reject(new Error('The amount is too big')); // Because Javascript
      }

      let txp = {
        outputs: [{
          'toAddress': vault.address.toString(),
          'script': vault.scriptPubKey.toBuffer().toString('hex'),
          'amount': vault.amount
        }],
        addressType: 'PP2SH',
        inputs: null, //Let merit wallet service figure out the inputs based
                      //on the selected wallet.
        feeLevel: feeLevel,
        excludeUnconfirmedUtxos: true,
        dryRun: dryRun,
      };
      return this.walletService.createTx(this.model.selectedWallet, txp);
    });
  }

  private findFeeLevel(amount: number): Promise<any> {
    return Promise.resolve(null);
  }

  private async getAllWallets(): Promise<Array<any>> {
    return await this.profileService.getWallets();
  }
}
