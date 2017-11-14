import * as _ from "lodash";

import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { ConfigService } from "merit/shared/config.service";
import { CreateVaultService } from "merit/vaults/create-vault/create-vault.service";
import { WalletService } from "merit/wallets/wallet.service";
import { ProfileService } from "merit/core/profile.service";

@IonicPage({
  defaultHistory: ['ProfileView']
})
@Component({
  selector: 'view-create-vault-general',
  templateUrl: 'general-info.html',
})
export class CreateVaultGeneralInfoView {

  public formData = { vaultName: '', whitelist: [] };
  public isNextAvailable = false;
  public whitelistCandidates = [];

  constructor(
    private navCtrl:NavController,
    private navParams: NavParams, 
    private createVaultService: CreateVaultService, 
    private profileService: ProfileService,
    private walletService: WalletService,
  ){}

  checkNextAvailable() {
    this.isNextAvailable = this.formData.vaultName.length > 0;
  }

  async ionViewDidLoad() {
    let data = this.createVaultService.getData();
    this.formData.vaultName = data.vaultName;
    this.formData.whitelist = data.whitelist;

    // fetch users wallets
    this.updateAllWallets().then((wallets) => {
      const walletDTOs = _.map(wallets, (w) => {
        console.log(w);
        return { 'id': w.id, 'name': w.name, 'pubKey': w.xPubKey };
      });
      this.whitelistCandidates = this.whitelistCandidates.concat(walletDTOs);
    });

    // fetch users vaults
    this.updateAllWVaults().then((vaults) => {
      this.whitelistCandidates = this.whitelistCandidates.concat(vaults);
    });
  }

  toDeposit() {
    this.createVaultService.updateData(this.formData);
    this.navCtrl.push('CreateVaultDepositView');
  }

  private updateAllWallets(): Promise<Array<any>> {
    const wallets = this.profileService.getWallets().then((ws) => {
      return Promise.all(_.map(ws, async (wallet:any) => {
        wallet.status = await this.walletService.getStatus(wallet);
        return wallet; 
      }));
    });
    return wallets;
  }

  private updateAllWVaults(): Promise<Array<any>> {
    return new Promise((resolve, reject) => {
      return resolve([]);
    });
  }
}