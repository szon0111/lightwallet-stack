import { Injectable } from '@angular/core';

import { LoggerService } from '@merit/common/services/logger.service';
import { MWCService } from '@merit/common/services/mwc.service';
import { IDisplayWallet } from "@merit/common/models/display-wallet";
import { IVault } from "@merit/common/models/vault";
import { WalletService } from '@merit/common/services/wallet.service';
import { ProfileService } from '@merit/common/services/profile.service';
import { RateService } from "@merit/common/services/rate.service";
import { MeritWalletClient } from '@merit/common/merit-wallet-client';
import { AddressService } from "@merit/common/services/address.service";

import { ENV } from '@app/env';

@Injectable()
export class VaultsService {

  private Bitcore;

  constructor(
    private logger: LoggerService,
    private walletService: WalletService,
    private profileService: ProfileService,
    private rateService: RateService,
    private addressService: AddressService,
    bwcService: MWCService
  ) {
    this.Bitcore = bwcService.getBitcore();
  }

  async getWalletVaults(wallet: IDisplayWallet): Promise<Array<any>> {
    const vaults = await wallet.client.getVaults();
    return vaults.map(v => Object.assign(v, {walletClient: wallet.client}));
  }

  getTxHistory(vault: any): Promise<Array<any>> {
    return vault.walletClient.getVaultTxHistory(vault._id, vault.address.network);
  }

  async sendFromVault(vault: any, spendKey: any, amount: number, address: any) {
    const tx = vault.walletClient.buildSpendVaultTx(vault, vault.coins, spendKey, amount, address, {});
    console.log(tx, 'vault tx');
    //return this.walletClient.broadcastRawTx({ rawTx: tx.serialize(), network: ENV.network });
  }



  editVault(vault: IVault) {
      //return this.profileService.getHeadWalletClient().then((walletClient) => {
      //  if (!this.walletClient) {
      //    this.walletClient = walletClient;
      //  }
      //  return this.vaultsService.getVaultCoins(walletClient, vault);
      //}).then((coins) => {
      //
      //  let network = this.walletClient.credentials.network;
      //
      //  let tx = this.walletClient.buildRenewVaultTx(coins, vault, masterKey, { network: network });
      //
      //  console.log('RENEW TX');
      //  console.log('tx: ', tx);
      //  console.log('Serialized: ', tx.serialize());
      //  vault.coins = [{ raw: tx.serialize(), network: network }];
      //
      //  return this.walletClient.renewVault(vault);
      //}).catch((err) => {
      //  throw err;
      //});
  }


  // todo ICreateVaultData
  async createVault(data: any) {

    await this.checkCreateData(data);

    const vault:any = await data.wallet.client.prepareVault(0, {
      amount: this.rateService.mrtToMicro(data.amount),
      whitelist: data.whiteList,
      masterPubKey: data.masterKey.key.publicKey,
      spendPubKey: this.Bitcore.HDPrivateKey.fromString(data.wallet.client.credentials.xPrivKey).publicKey,
    });

    let scriptReferralOpts = {
      parentAddress: data.wallet.client.getRootAddress().toString(),
      pubkey: data.masterKey.key.publicKey.toString(),
      signPrivKey: data.masterKey.key.privateKey,
      address: vault.address.toString(),
      addressType: this.Bitcore.Address.ParameterizedPayToScriptHashType, // pubkey address
      network: data.wallet.client.network
    };

    const password = await this.walletService.prepare(data.wallet.client);
    await data.wallet.client.sendReferral(scriptReferralOpts);
    await data.wallet.client.sendInvite(scriptReferralOpts.address, 1, vault.scriptPubKey.toHex());
    const txp = await this.getCreateTxp(vault, data.wallet);
    const pubTxp = await this.walletService.publishTx(data.wallet.client, txp);
    const signedTxp = await this.walletService.signTx(data.wallet.client, pubTxp, password);

    vault.coins.push(signedTxp);
    vault.name = data.vaultName;

    await data.wallet.client.createVault(vault);
    await this.profileService.addVault({
      id: vault.address,
      copayerId: data.wallet.client.credentials.copayerId,
      name: vault.vaultName,
    });
  }


  private async checkCreateData(data) {
    if (
      !data.vaultName
      || !data.wallet
      || !data.whiteList
      || !data.whiteList.length
      || !data.amount
      || !data.masterKey || !data.masterKey.key || !data.masterKey.phrase
    ) {
      this.logger.warn('Incorrect data', data);
      throw new Error('Incorrect data');
    }

    const status = await this.walletService.getStatus(data.wallet.client, { force: true });

    if (!status.availableInvites) {
      throw new Error("You don't have any active invites that you can use to create a vault");
    }
    if (data.amount > status.spendableAmount) {
      throw new Error("Wallet balance is less than vault balance");
    }

    return true;
  }



  private async getCreateTxp(vault: any, wallet: IDisplayWallet): Promise<any> {
    let feeLevel = 'normal'; //todo temp

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
      dryRun: false,
    };
    return this.walletService.createTx(wallet.client, txp);
  }

}


