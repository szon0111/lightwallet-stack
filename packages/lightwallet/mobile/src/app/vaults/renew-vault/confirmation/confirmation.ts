import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { MeritWalletClient } from '@merit/common/merit-wallet-client';
import { MWCService } from '@merit/common/services/mwc.service';
import { MeritToastController, ToastConfig } from '@merit/common/services/toast.controller.service';
import { RenewVaultService } from '@merit/mobile/app/vaults/renew-vault/renew-vault.service';

@IonicPage({
  segment: 'vault/:vaultId/renew/confirmation',
  defaultHistory: ['VaultRenewView']
})
@Component({
  selector: 'view-renew-confirmation',
  templateUrl: 'confirmation.html',
})
export class VaultRenewConfirmationView {

  private updatedVault: any;
  private vault: any;
  private bitcore: any;
  private formData = { masterKeyMnemonic: '' };
  private walletClient: MeritWalletClient = null;

  constructor(private navCtrl: NavController,
              private navParams: NavParams,
              private bwc: MWCService,
              private toastCtrl: MeritToastController,
              private renewVaultService: RenewVaultService) {
    this.updatedVault = this.navParams.get('updatedVault');
    this.vault = this.navParams.get('vault');
    this.bitcore = this.bwc.getBitcore();
    this.walletClient = this.navParams.get('walletClient');
  }

  ionViewDidLoad() {
    console.log('confirmation view', this.updatedVault, this.vault);
  }

  private sanatizeMnemonic(rawmnemonic: string): string {
    let trimmed = rawmnemonic.trim();
    return trimmed.toLowerCase();
  }

  private renew() {
    // create master key from mnemonic
    const network = this.vault.address.network;

    //validate mnemonic
    let masterKeyMnemonic;
    try {
      const sanatizedMasterKeyMnemonic = this.sanatizeMnemonic(this.formData.masterKeyMnemonic);
      masterKeyMnemonic = this.walletClient.getNewMnemonic(sanatizedMasterKeyMnemonic);
    } catch (ex) {
      return this.toastCtrl.create({
        message: 'The master key must only contain words seperated by spaces.',
        cssClass: ToastConfig.CLASS_ERROR
      }).present();
    }

    const xMasterKey = masterKeyMnemonic.toHDPrivateKey('', network);
    console.log('xMasterKey', xMasterKey);
    console.log('MasterPub', xMasterKey.publicKey.toString());
    console.log('OrigPubKey', new this.bitcore.PublicKey(this.updatedVault.masterPubKey, network).toString());

    return this.renewVaultService.renewVault(this.updatedVault, xMasterKey).then(() => {
      return this.navCtrl.goToRoot({}).then(() => {
        return this.navCtrl.push('VaultDetailsView', { vaultId: this.vault._id, vault: this.vault });
      });
    });
  }
}
