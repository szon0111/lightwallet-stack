import { Injectable } from '@angular/core';

import { LoggerService } from '@merit/common/services/logger.service';
import { DisplayWallet } from "@merit/common/models/display-wallet";
import { IVault } from "@merit/common/models/vault";
import { WalletService } from '@merit/common/services/wallet.service';
import { ProfileService } from '@merit/common/services/profile.service';
import { RateService } from "@merit/common/services/rate.service";
import { MeritWalletClient } from '@merit/common/merit-wallet-client';
import { Constants } from '@merit/common/merit-wallet-client/common/constants';
import { AddressService } from "@merit/common/services/address.service";
import { FeeService } from '@merit/common/services/fee.service';
import { ENV } from '@app/env';
import * as Bitcore from 'bitcore-lib';

export interface IVaultCreateData {
  vaultName: string,
  whiteList: Array<DisplayWallet>,
  wallet: DisplayWallet,
  amount: number,
  masterKey: {key: any, phrase: string}
}

@Injectable()
export class VaultsService {

  private readonly DEFAULT_FEE = 100000;

  private Bitcore;

  constructor(
    private logger: LoggerService,
    private walletService: WalletService,
    private profileService: ProfileService,
    private rateService: RateService,
    private addressService: AddressService,
    private feeService: FeeService
  ) {
  }

  async getWalletVaults(wallet: MeritWalletClient): Promise<Array<any>> {
    const vaults = await wallet.getVaults();
    return vaults.map(v => Object.assign(v, {walletClient: wallet}) ); 
  }

  async getVaultInfo(vault: IVault): Promise<IVault> {
    return Object.assign(vault, await vault.walletClient.getVault(vault.address));
  }

  getTxHistory(vault: any): Promise<Array<any>> {
    return vault.walletClient.getVaultTxHistory(vault._id, vault.address.network);
  }

  async editVaultName(vault: IVault, newName: string) {
    return vault.walletClient.updateVaultInfo({_id: vault._id, name: newName});
  }

  async sendFromVault(vault: any, amount: number, toAddress: any) {
    vault = await this.getVaultInfo(vault);

    const txp = await vault.walletClient.buildSpendVaultTx(vault, amount, toAddress, {});
    const fee = await this.getTxpFee(txp);
    const tx = await vault.walletClient.buildSpendVaultTx(vault, amount, toAddress, fee);
    await vault.walletClient.broadcastRawTx({ rawTx: tx.serialize(), network: ENV.network });
    vault = vault.walletClient.updateVaultInfo({_id: vault._id}); 
    this.profileService.updateVault(vault);
    return vault; 
  }

  /*
  * renewing vault means changing whitelist. Address and redeem script stays the same, but scriptPubKey changes 
  * so we take all utxos and send them to the same address but differrent scriptPubkey
  */
  async renewVaultWhitelist(vault: IVault, newWhitelist: Array<any>, masterKey) {
    vault = await this.getVaultInfo(vault);

    newWhitelist = newWhitelist.map(w => w.client.getRootAddress().toString());
    let txp = await this.getRenewTxp(vault, newWhitelist, masterKey);
    const fee = await this.getTxpFee(txp);
    txp = await this.getRenewTxp(vault, newWhitelist, masterKey, fee);

    let txid = await vault.walletClient.broadcastRawTx({ rawTx: txp.serialize(), network: ENV.network });

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

    const vault:any = this.prepareVault(0, {
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

    const depositData = {amount: data, address: vault.address, scriptPubKey: vault.data};
    const txp = await this.getDepositTxp(depositData, data.wallet.client);
    const pubTxp = await this.walletService.publishTx(data.wallet.client, txp);
    const signedTxp = await this.walletService.signTx(data.wallet.client, pubTxp, password);

    vault.coins = [signedTxp];
    vault.name = data.vaultName;
    await data.wallet.client.createVault(vault);
    this.profileService.addVault(vault);
    return vault;
  }

  /* 
  * sending money to existing vault
  */
  async depositVault(vault, amount) {
    vault = await this.getVaultInfo(vault);

    const address = this.Bitcore.Address(vault.address);
    const scriptPubKey = this.Bitcore.Script(vault.scriptPubKey).toBuffer().toString('hex');
    const txp = await this.getDepositTxp({address, scriptPubKey, amount}, vault.walletClient);
    await this.walletService.publishAndSign(vault.walletClient, txp);
    vault =  vault.walletClient.updateVaultInfo({_id: vault._id, name: vault.name});
    this.profileService.updateVault(vault);
    return vault; 
  }

  /* 
  * check if we can create vault 
  */
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

  /*
  * renewing vault means changing whitelist. Address and redeem script stays the same, but scriptPubKey changes 
  * so we take all utxos and send them to the same address but differrent scriptPubkey
  */
  private getRenewTxp(vault, newWhitelist, masterKey, fee = this.DEFAULT_FEE) {
    const amount = vault.amount - fee;

    if (vault.type != 0) throw 'Vault type is not supported';

    let tx = Bitcore.Transaction();
    
    let params = [
      new Bitcore.PublicKey(vault.spendPubKey, { network: ENV.network }).toBuffer(),
      new Bitcore.PublicKey(vault.masterPubKey, { network: ENV.network }).toBuffer()
    ];

    const whitelist = newWhitelist.map(w => Bitcore.Address(w).hashBuffer);
    const spendLimit = this.rateService.mrtToMicro(Constants.VAULT_SPEND_LIMIT);
    params.push(Bitcore.crypto.BN.fromNumber(spendLimit).toScriptNumBuffer());
    params = params.concat(whitelist);
    params.push(Bitcore.Opcode.smallInt(whitelist.length));
    params.push(new Buffer(vault.tag));
    params.push(Bitcore.Opcode.smallInt(vault.type));

    const redeemScript = new Bitcore.Script(vault.redeemScript);
    const scriptPubKey = Bitcore.Script.buildMixedParameterizedP2SH(redeemScript, params, masterKey.publicKey);

    const output = new Bitcore.Transaction.Output({ script: scriptPubKey, micros: amount });
    tx.addOutput(output);
    tx.fee(fee);

    vault.coins.forEach(coin => {
      const input = { prevTxId: coin.txid, outputIndex: coin.vout, script: redeemScript };
      const PP2SHInput = new Bitcore.Transaction.Input.PayToScriptHashInput(input, redeemScript, coin.scriptPubKey);
      tx.addInput(PP2SHInput, coin.scriptPubKey, coin.micros);
    });

    tx.addressType = 'PP2SH';

    tx.inputs.forEach((input, i) => {
      let sig = Bitcore.Transaction.Sighash.sign(tx, masterKey.privateKey, Bitcore.crypto.Signature.SIGHASH_ALL, i, redeemScript);
      let inputScript = Bitcore.Script.buildVaultRenewIn(sig, redeemScript, Bitcore.PublicKey(vault.masterPubKey, ENV.network));
      input.setScript(inputScript);
    });

    return tx;
  }

  /*
  * creating transaction to transfer money from vault to one of whitelisted addresses
  */
  private getSendTxp(vault, amount, address, fee = this.DEFAULT_FEE) {
    
    if (vault.type != 0) throw 'Vault type is not supported';

    //todo why are we using wallet private key here???
    const spendKey = Bitcore.HDPrivateKey.fromString(vault.walletClient.credentials.xPrivKey);

    let selectedCoins = [];
    let selectedAmount = 0;
    for(let c = 0; c < vault.coins.length && selectedAmount < amount; c++) {
      let coin = vault.coins[c];
      selectedAmount += coin.micros;
      selectedCoins.push(coin);
    }

    if(selectedAmount < amount) throw new Error('Insufficient funds');

    const change = selectedAmount - amount;

    let tx = new Bitcore.Transaction();
    let redeemScript = new Bitcore.Script(vault.redeemScript);

    let params = [
      new Bitcore.PublicKey(vault.spendPubKey, { network: ENV.network }).toBuffer(),
      new Bitcore.PublicKey(vault.masterPubKey, { network: ENV.network }).toBuffer(),
    ];

    let whitelist = vault.whitelist.map(w => Bitcore.Address(w).hashBuffer);
    const spendLimit = this.rateService.mrtToMicro(Constants.VAULT_SPEND_LIMIT);
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

    tx.fee(fee);

    selectedCoins.forEach(coin => {
      const input = { prevTxId: coin.txid, outputIndex: coin.vout, script: redeemScript };
      const PP2SHInput = new Bitcore.Transaction.Input.PayToScriptHashInput(input, redeemScript, coin.scriptPubKey);
      tx.addInput(PP2SHInput, coin.scriptPubKey, coin.micros);
    });

    tx.addressType = 'PP2SH';

    tx.inputs.forEach((input, i) => {
      let sig = Bitcore.Transaction.Sighash.sign(tx, spendKey.privateKey, Bitcore.crypto.Signature.SIGHASH_ALL, i, redeemScript);
      let inputScript = Bitcore.Script.buildVaultSpendIn(sig, redeemScript, new Bitcore.PublicKey(vault.masterPubKey, ENV.network));
      input.setScript(inputScript);
    });

    return tx;

  }  

  /* 
  * transfer money to vault
  */ 
  private async getDepositTxp(vault: any, wallet: MeritWalletClient): Promise<any> {
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

  private async getTxpFee(txp) {
    const feePerKB = await this.feeService.getCurrentFeeRate(ENV.network);
    const fee = Math.round(feePerKB * txp.serialize().length / 1024);
    return fee; 
  }

  private prepareVault(type: number, opts: any = {}) {
    
    if (type != 0) throw 'Vault type is not supported';

    let tag = opts.masterPubKey.toAddress().hashBuffer;

    let whitelist = opts.vault.whitelist.map(w => Bitcore.Address(w).hashBuffer);

    let params = [
      opts.spendPubKey.toBuffer(),
      opts.masterPubKey.toBuffer(),
    ];
    const spendLimit = this.rateService.mrtToMicro(Constants.VAULT_SPEND_LIMIT);       
    params.push(Bitcore.crypto.BN.fromNumber(spendLimit).toScriptNumBuffer());
    params = params.concat(whitelist);
    params.push(Bitcore.Opcode.smallInt(whitelist.length));
    params.push(tag);
    params.push(Bitcore.Opcode.smallInt(type));

    let redeemScript = Bitcore.Script.buildSimpleVaultScript(tag, ENV.network);
    let scriptPubKey = Bitcore.Script.buildMixedParameterizedP2SH(redeemScript, params, opts.masterPubKey);

    let vault = {
      type: type,
      tag: opts.masterPubKey.toAddress().hashBuffer,
      whitelist: opts.whitelist,
      spendPubKey: opts.spendPubKey,
      masterPubKey: opts.masterPubKey,
      redeemScript: redeemScript,
      scriptPubKey: scriptPubKey,
      address: Bitcore.Address(scriptPubKey.getAddressInfo())
    };

    return vault;
  }

}


