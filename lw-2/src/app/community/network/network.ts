import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';
import { Wallet } from "./../../wallets/wallet.model";
import { ProfileService } from "./../../core/profile.service";
import { ModalController } from "ionic-angular/index";

// Network View 
// Part of the Community Tab.
@IonicPage()
@Component({
  selector: 'page-network',
  templateUrl: 'network.html',
})
export class NetworkView {

  public wallets:Array<Wallet>;
  public wallet:Wallet;

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    private profileService:ProfileService,
    private modalCtrl:ModalController
  ) {

  }

  ionViewDidLoad() {
    //do something here
    this.wallets = this.profileService.getWallets();
    this.wallet = this.wallets[0];
  }


  selectWallet() {
    let modal = this.modalCtrl.create('SelectWalletModal', {selectedWallet: this.wallet, availableWallets: this.wallets});
    modal.present();
    modal.onDidDismiss((wallet) => {
      if (wallet) this.wallet = wallet;
    });
  }

}
