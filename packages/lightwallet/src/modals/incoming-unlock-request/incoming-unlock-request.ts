import { Component } from '@angular/core';
import { IonicPage, NavParams, ViewController } from 'ionic-angular';

@IonicPage()
@Component({
  selector: 'modal-incoming-unlock-request',
  templateUrl: 'incoming-unlock-request.html',
})
export class IncomingUnlockRequestModal {
  request: any;

  constructor(private viewCtrl: ViewController,
              private navParams: NavParams) {
    this.request = navParams.get('request');
  }

  accept() {
    this.dismiss()
  }

  decline() {
    this.dismiss();
  }

  dismiss() {
    return this.viewCtrl.dismiss();
  }

  isWalletAddress(walletName: string) {
    // TODO check if string is a wallet address or an alias
    // TODO this should probably be a pipe (walletName)
    return false;
  }
}
