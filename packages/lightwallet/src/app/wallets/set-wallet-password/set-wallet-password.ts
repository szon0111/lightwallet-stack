import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { ToastConfig } from 'merit/core/toast.config';
import { MeritToastController } from 'merit/core/toast.controller';
import { WalletService } from 'merit/wallets/wallet.service';


@IonicPage()
@Component({
  selector: 'view-set-wallet-password',
  templateUrl: 'set-wallet-password.html',
})
export class SetWalletPasswordView {

  public wallet: any;

  public isWalletEncrypted: boolean;

  public formData = {
    password: '',
    repeatPassword: '',
    currentPassword: ''
  };

  constructor(private navCtrl: NavController,
              private navParams: NavParams,
              private toastCtrl: MeritToastController,
              private walletService: WalletService) {
    this.wallet = navParams.get('wallet');
    this.isWalletEncrypted = this.walletService.isEncrypted(this.wallet);
  }

  async setPassword() {


    if (this.formData.password != this.formData.repeatPassword) {
      return this.toastCtrl.create({
        message: 'Passwords don\'t match',
        cssClass: ToastConfig.CLASS_ERROR
      }).present();
    }


    const encrypt = async () => {
      try {
        await this.walletService.encrypt(this.wallet, this.formData.password);
        this.navCtrl.pop();
      } catch (err) {
        return this.toastCtrl.create({
          message: err,
          cssClass: ToastConfig.CLASS_ERROR
        }).present();
      }
    };


    if (this.isWalletEncrypted) {
      try {
        await this.walletService.decrypt(this.wallet, this.formData.currentPassword);
        return encrypt();
      } catch (err) {
        return this.toastCtrl.create({
          message: 'Incorrect current password',
          cssClass: ToastConfig.CLASS_ERROR
        }).present();
      }
    } else {
      return encrypt();
    }

  }

  public saveEnabled() {
    return (
      this.formData.password
      && (this.isWalletEncrypted ? this.formData.currentPassword : true)
    );
  }


}