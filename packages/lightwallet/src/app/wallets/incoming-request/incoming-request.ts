import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams, ViewController, ModalController, LoadingController } from 'ionic-angular';
import { AddressBookService } from 'merit/shared/address-book/address-book.service';
import { SendService } from 'merit/transact/send/send.service';
import { MeritContact } from 'merit/shared/address-book/merit-contact.model';
import { IDisplayWallet } from 'merit/../models/display-wallet';
import { MERIT_MODAL_OPTS } from 'merit/../utils/constants';
import { MeritToastController } from 'merit/core/toast.controller';
import { ToastController } from 'ionic-angular/components/toast/toast-controller';
import { ToastConfig } from 'merit/core/toast.config';
import { WalletService } from 'merit/wallets/wallet.service';
import { UnlockRequestService } from 'merit/core/unlock-request.service';

@IonicPage()
@Component({
  selector: 'view-incoming-request',
  templateUrl: 'incoming-request.html',
})
export class IncomingRequestModal { 

  public unlockRequest:any;
  public contacts: Array<MeritContact> = [];
  public wallets: Array<IDisplayWallet> = [];

  constructor(
    private navCtrl: NavController,
    private navParams: NavParams,
    private viewCtrl: ViewController,
    private modalCtrl: ModalController,
    private addressBookService: AddressBookService,
    private sendService: SendService,
    private walletService: WalletService,
    private toastCtrl: ToastController,
    private unlockService: UnlockRequestService,
    private loadingCtrl: LoadingController

  ) {
    this.unlockRequest = this.navParams.get('request');
    this.wallets = this.navParams.get('wallets');

    console.log(this.unlockRequest, 'unlock request');
    console.log(this.wallets, 'wallets');
  }

  async ionViewDidLoad() {
    this.contacts = await this.addressBookService.getAllMeritContacts();
  }

  async accept() {

    let loader = this.loadingCtrl.create({content: 'Confirming request...'});
    try {
      loader.present();
      await this.unlockService.confirmRequest(this.unlockRequest);
    } catch (e) {
      this.toastCtrl.create({
        message: e.text || 'Unknown Error',
        position: ToastConfig.POSITION,
        duration: ToastConfig.DURATION,
        cssClass: ToastConfig.CLASS_ERROR
      }).present();
    } finally {
      loader.dismiss();
    }
  }

  async decline() {
    await this.unlockService.hideRequest(this.unlockRequest);
    this.navCtrl.pop();
  }

  createContact() {
    let meritAddress = {address: this.unlockRequest.address, network: this.sendService.getAddressNetwork( this.unlockRequest.address).name};
    let modal = this.modalCtrl.create('SendCreateContactView', {address: meritAddress});
    modal.onDidDismiss((contact) => {
      this.navCtrl.pop();
    });
    modal.present();
  }

  bindContact() {
    let meritAddress = {address: this.unlockRequest.address, network: this.sendService.getAddressNetwork( this.unlockRequest.address).name};
    let modal = this.modalCtrl.create('SendSelectBindContactView', {contacts: this.contacts, address: meritAddress});
    modal.onDidDismiss((contact) => {
      this.navCtrl.pop();
    }); 

    modal.present();
  }

  continue() {
    this.navCtrl.pop();
  }

  selectWallet() {
    const modal = this.modalCtrl.create('SelectInviteWalletModal', {
      selectedWallet: this.unlockRequest.walletClient,
      availableWallets: this.wallets
    }, MERIT_MODAL_OPTS); 
    modal.onDidDismiss((wallet) => {
      if (wallet) {
        this.unlockRequest.walletClient = wallet;
      }
    });
    return modal.present();
  }

}
