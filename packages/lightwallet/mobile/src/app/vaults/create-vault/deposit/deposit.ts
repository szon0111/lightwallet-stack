import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import * as _ from 'lodash';
import { CreateVaultService } from '@merit/mobile/app/vaults/create-vault/create-vault.service';
import { ProfileService } from '@merit/common/services/profile.service';
import { WalletService } from '@merit/common/services/wallet.service';
import { MWCService } from '@merit/common/services/mwc.service';
import { LoggerService } from '@merit/common/services/logger.service';
import { MeritWalletClient } from '@merit/common/merit-wallet-client';

@IonicPage({
  defaultHistory: ['WalletsView']
})
@Component({
  selector: 'view-create-vault-deposit',
  templateUrl: 'deposit.html',
})
export class CreateVaultDepositView {

  public formData = {
    totalAvailable: 0,
    amountToDeposit: null,
    amountAvailable: 0,
    selectedWallet: null,
    walletName: ''
  };
  public isNextAvailable = false;
  private bitcore = null;

  constructor(private navCtrl: NavController,
              private createVaultService: CreateVaultService,
              private profileService: ProfileService,
              private walletService: WalletService,
              private bwcService: MWCService,
              private logger: LoggerService,
              public navParams: NavParams,) {
  }

  checkNextAvailable() {
    this.isNextAvailable = this.formData.amountToDeposit > 0 && this.formData.amountAvailable >= this.formData.amountToDeposit;
  }

  ionViewDidLoad() {
    this.bitcore = this.bwcService.getBitcore();

    let data = this.createVaultService.getData();
    this.formData.amountToDeposit = data.amountToDeposit;
    this.formData.amountAvailable = data.amountAvailable;
    this.checkNextAvailable();

    this.getAllWallets().then((wallets: Array<MeritWalletClient>) => {
      _.each(wallets, (w) => this.logger.info(w));
      const wallet = wallets[0];
      const computed = wallet.status.balance.availableConfirmedAmount;
      const total = wallet.status.balance.availableAmount;
      const mrt = this.bitcore.Unit.fromMicros(computed).toMRT();
      const totalMrt = this.bitcore.Unit.fromMicros(total).toMRT();
      this.formData.selectedWallet = wallet;
      this.formData.amountAvailable = mrt;
      this.formData.totalAvailable = totalMrt;
      this.formData.walletName = wallet.name || wallet.id;
    });

    this.checkNextAvailable();
  }

  toMasterKey() {
    this.createVaultService.updateData(this.formData);
    this.navCtrl.push('CreateVaultMasterKeyView', { refreshVaultList: this.navParams.get('refreshVaultList') });
  }

  private getAllWallets(): Promise<Array<MeritWalletClient>> {
    return this.profileService.getWallets().then((ws) => {
      return Promise.all(_.map(ws, async (wallet: MeritWalletClient) => {
        wallet.status = await this.walletService.getStatus(wallet);
        return wallet;
      }));
    });
  }
}