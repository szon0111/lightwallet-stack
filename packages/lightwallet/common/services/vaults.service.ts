import { Injectable } from '@angular/core';

import { LoggerService } from '@merit/common/services/logger.service';
import { MWCService } from '@merit/common/services/mwc.service';
import { DisplayWallet } from "@merit/common/models/display-wallet";
import { IVault } from "@merit/common/models/vault";
import { WalletService } from '@merit/common/services/wallet.service';
import { ProfileService } from '@merit/common/services/profile.service';
import { RateService } from "@merit/common/services/rate.service";
import { MeritWalletClient } from '@merit/common/merit-wallet-client';
import { AddressService } from "@merit/common/services/address.service";
import { FeeService } from '@merit/common/services/fee.service';


import { ENV } from '@app/env';

export interface IVaultCreateData {
  vaultName: string,
  whiteList: Array<DisplayWallet>,
  wallet: DisplayWallet,
  amount: number,
  masterKey: {key: any, phrase: string}
}

@Injectable()
export class VaultsService {

  private Bitcore;

  constructor(
    private logger: LoggerService,
    private walletService: WalletService,
    private profileService: ProfileService,
    private rateService: RateService,
    private addressService: AddressService,
    private feeService: FeeService,
    bwcService: MWCService
  ) {
    this.Bitcore = bwcService.getBitcore();
  }

  async getWalletVaults(wallet: DisplayWallet): Promise<Array<any>> {
    const vaults = await wallet.client.getVaults();
    return vaults.map(v => Object.assign(v, {walletClient: wallet.client}) );
  }

  getTxHistory(vault: any): Promise<Array<any>> {
    return vault.walletClient.getVaultTxHistory(vault._id, vault.address.network);
  }

  async sendFromVault(vault: any, amount: number, recipientAddress: any) {
    const txp = await vault.walletClient.buildSpendVaultTx(vault, amount, recipientAddress, {});
    const feePerKB = await this.feeService.getCurrentFeeRate(ENV.network);
    const fee = Math.round(feePerKB * txp.serialize().length / 1024);
    const tx = await vault.walletClient.buildSpendVaultTx(vault, amount, recipientAddress, {fee});
    await vault.walletClient.broadcastRawTx({ rawTx: tx.serialize(), network: ENV.network });
    vault.coins =  await vault.walletClient.getVaultCoins(vault);
    vault.amount = vault.coins.reduce((amount, coin) => {
      return amount + coin.micros;
    }, 0);
    const infoToUpdate = { _id: vault._id, name: vault.name, coins: vault.coins,  amount: vault.amount};
    return vault.walletClient.updateVaultInfo(infoToUpdate);
  }

  async editVaultName(vault: IVault, newName: string) {
    return vault.walletClient.updateVaultInfo({_id: vault._id, name: newName});
  }

  async renewVaultWhitelist(vault: IVault, newWhitelist: Array<any>, masterKey) {

    newWhitelist = newWhitelist.map(w => w.client.getRootAddress().toString());

    let tx = await vault.walletClient.buildRenewVaultTx(vault, newWhitelist, masterKey);
    const feePerKB = await this.feeService.getCurrentFeeRate(ENV.network);
    const fee = Math.round(feePerKB * tx.serialize().length / 1024);
    tx = await vault.walletClient.buildRenewVaultTx(vault, newWhitelist, masterKey);

    let txid = await vault.walletClient.broadcastRawTx({ rawTx: tx.serialize(), network: ENV.network });

    const infoToUpdate = {
      _id: vault._id,
      status: 'renewing',
      whitelist: newWhitelist,
      initialTxId: txid
    };
    return vault.walletClient.updateVaultInfo(infoToUpdate);
  }

  async createVault(data: IVaultCreateData) {

    await this.checkCreateData(data);

    const vault:any = await data.wallet.client.prepareVault(0, {
      amount: data.amount,
      whitelist: data.whiteList.map(w => w.client.getRootAddress().toBuffer()),
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
    vault.scriptPubKey = vault.scriptPubKey.toBuffer().toString('hex');
    const txp = await this.getCreateTxp(vault, data.wallet.client);
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

  async depositVault(vault, amount) {
    const address = this.Bitcore.Address(vault.address);
    const scriptPubKey = this.Bitcore.Script(vault.scriptPubKey).toBuffer().toString('hex');
    const txp = await this.getCreateTxp({address, scriptPubKey, amount}, vault.walletClient);
    await this.walletService.publishAndSign(vault.walletClient, txp);
    return vault.walletClient.updateVaultInfo({_id: vault._id, name: vault.name});
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


  private async getCreateTxp(vault: any, wallet: MeritWalletClient): Promise<any> {
    let feeLevel = this.feeService.getCurrentFeeLevel();

    if (vault.amount > Number.MAX_SAFE_INTEGER) {
      return Promise.reject(new Error('The amount is too big')); // Because Javascript
    }


    let txp:any = {
      outputs: [{
        'toAddress': vault.address.toString(),
        'script': vault.scriptPubKey,
        'amount': vault.amount
      }],
      addressType: 'PP2SH',
      inputs: null, //Let merit wallet service figure out the inputs based
                    //on the selected wallet.
      feeLevel: feeLevel,
      excludeUnconfirmedUtxos: true,
      dryRun: true
    };
    if (vault.amount == wallet.status.confirmedAmount) {
      delete txp.outputs[0].amount;
      txp.sendMax = true;
    }
    const createdTx = await wallet.createTxProposal(txp);
    if (txp.sendMax) {
      delete txp.sendMax;
      delete txp.feeLevel;
      txp.fee = createdTx.fee;
      txp.outputs[0].amount = createdTx.outputs[0].amount;
      txp.inputs = createdTx.inputs;
    }
    txp.dryRun = false;
    return await wallet.createTxProposal(txp);
  }

}


