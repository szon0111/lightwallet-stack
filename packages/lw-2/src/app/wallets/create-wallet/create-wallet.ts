import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams, LoadingController, ModalController } from 'ionic-angular';
import { ConfigService } from "merit/shared/config.service";
import { WalletService } from "merit/wallets/wallet.service";
import { MeritToastController } from "merit/core/toast.controller";
import { ToastConfig } from "merit/core/toast.config";


@IonicPage({
  defaultHistory: ['WalletsView']
})
@Component({
  selector: 'view-create-wallet',
  templateUrl: 'create-wallet.html',
})
export class CreateWalletView {

  public formData = {
    walletName: '',
    unlockCode: '',
    bwsurl: '',
    recoveryPhrase: '',
    password: '',
    repeatPassword: '',
    color: '',
    hideBalance: false
  }

  public defaultBwsUrl:string;

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    private config:ConfigService,
    private walletService:WalletService,
    private loadCtrl:LoadingController,
    private toastCtrl:MeritToastController,
    private modalCtrl:ModalController
  ) {
    this.formData.bwsurl = config.getDefaults().bws.url;
    this.defaultBwsUrl = config.getDefaults().bws.url;
  }

  isCreationEnabled() {
    return (
      this.formData.unlockCode
      && this.formData.walletName
    );
  }

  selectColor() {
    let modal = this.modalCtrl.create('SelectColorView', {color: this.formData.color});
    modal.onDidDismiss((color) => {
      if (color) {
        this.formData.color = color;
      }
    });
    modal.present();
  }

  async createWallet() {

    if (this.formData.password != this.formData.repeatPassword) {
      return this.toastCtrl.create({
        message: "Passwords don't match",
        cssClass: ToastConfig.CLASS_ERROR
      }).present();
    }

    let opts = {
      name: this.formData.walletName,
      unlockCode: this.formData.unlockCode,
      bwsurl: this.formData.bwsurl,
      mnemonic: this.formData.recoveryPhrase,
      networkName: 'testnet', //todo temp!
      m: 1, //todo temp!
      n: 1 //todo temp!
    };

    let loader = this.loadCtrl.create({
      content: 'Creating wallet'
    });
    loader.present();

    try {

      let wallet = await this.walletService.createWallet(opts);
      if (this.formData.hideBalance) await this.walletService.setHiddenBalanceOption(wallet.id, this.formData.hideBalance);
      if (this.formData.password) await this.walletService.encrypt(wallet, this.formData.password);
      if (this.formData.color) {
        let colorOpts = {colorFor: {}};
        colorOpts.colorFor[wallet.id] = this.formData.color;
        console.log('COLOR OPTS', colorOpts);
        await this.config.set(colorOpts);
      }
      loader.dismiss();
      this.navCtrl.pop();
    } catch (err) {
      loader.dismiss();
      this.toastCtrl.create({
        message: JSON.stringify(err),
        cssClass: ToastConfig.CLASS_ERROR
      }).present();
    }

  }


}

