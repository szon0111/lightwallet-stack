import { Component } from '@angular/core';
import { IonicComponent, NavController, NavParams } from 'ionic-angular';
import {Wallet} from "../../../models/wallet";
import {ProfileService} from "../../../providers/profile-service";
import {ModalController} from "ionic-angular/index";


@IonicComponent()
@Component({
  selector: 'component-network',
  templateUrl: 'network.html',
})
export class NetworkComponent {

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