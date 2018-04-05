import { AlertController, IonicPage, LoadingController, NavController, NavParams, Tabs } from 'ionic-angular';
import { Component } from '@angular/core';
import * as  _ from 'lodash';
import { EasySend } from '@merit/common/models/easy-send';
import { MeritWalletClient } from '@merit/common/merit-wallet-client';
import { TouchIdService } from '@merit/mobile/services/touch-id.service';
import { WalletService } from '@merit/common/services/wallet.service';
import { TxFormatService } from '@merit/common/services/tx-format.service';
import { RateService } from '@merit/common/services/rate.service';
import { ConfigService } from '@merit/common/services/config.service';
import { LoggerService } from '@merit/common/services/logger.service';
import { ISendMethod, SendMethodDestination, SendMethodType } from '@merit/common/models/send-method';
import { MeritToastController, ToastConfig } from '@merit/common/services/toast.controller.service';

@IonicPage()
@Component({
  selector: 'view-send-confirmation',
  templateUrl: 'send-confirmation.html',
})
export class SendConfirmationView {

  txData: {
    amount: number; // micros
    totalAmount: number; // micros
    feeIncluded: boolean;
    easyFee: number,
    password: string;
    recipient: {
      label: string;
      name: string;
      emails?: Array<{ value: string }>;
      phoneNumbers?: Array<{ value: string }>;
    };
    sendMethod: ISendMethod;
    txp: any;
    easySend?: EasySend;
    easySendUrl?: string;
    wallet: MeritWalletClient;
    referralsToSign: Array<any>;
  };

  viewData: any;

  unlockValue: number = 0;

  constructor(navParams: NavParams,
              private navCtrl: NavController,
              private toastCtrl: MeritToastController,
              private alertController: AlertController,
              private loadingCtrl: LoadingController,
              private touchIdService: TouchIdService,
              private walletService: WalletService,
              private formatService: TxFormatService,
              private rateService: RateService,
              private configService: ConfigService,
              private logger: LoggerService) {
    this.txData = navParams.get('txData');
  }

  ionViewDidEnter() {
    this.navCtrl.swipeBackEnabled = false;
  }

  ionViewWillLeave() {
    this.navCtrl.swipeBackEnabled = true;
  }

  async ngOnInit() {

    const viewData: any = {
      recipient: this.txData.recipient,
      amount:  this.txData.amount,
      totalAmount: this.txData.feeIncluded ? this.txData.amount : this.txData.amount + this.txData.txp.fee + this.txData.easyFee,
      password: this.txData.password,
      feePercent: this.txData.txp.feePercent,
      fee: this.txData.txp.fee + this.txData.easyFee,
      walletName: this.txData.wallet.name || this.txData.wallet.id,
      walletColor: this.txData.wallet.color,
      walletCurrentBalance: this.txData.wallet.balance.totalAmount,
      feeIncluded: this.txData.feeIncluded,
      fiatCode: this.configService.get().wallet.settings.alternativeIsoCode.toUpperCase(),
      methodName: this.txData.sendMethod.type == SendMethodType.Easy ? 'Global Send' : 'Classic Send',
      destination: this.txData.sendMethod.alias ? '@'+this.txData.sendMethod.alias : this.txData.sendMethod.value
    };

    viewData.walletRemainingBalance =  this.txData.wallet.balance.totalAmount - viewData.totalAmount;

    const amountMrtLength = (this.rateService.microsToMrt(viewData.amount)+'').length;

    if (amountMrtLength < 5) {
      viewData.priceReviewClass = 'big';
    } else if  (amountMrtLength < 9) {
      viewData.priceReviewClass = 'medium';
    } else if (amountMrtLength < 12) {
      viewData.priceReviewClass = 'small';
    } else {
      viewData.priceReviewClass = 'tiny';
    }

    this.viewData = viewData;
  }

  sendAllowed() {
    return this.txData && !_.isEmpty(this.txData.txp);
  }

  approve() {
    let showPassPrompt = (highlightInvalid = false) => {
      this.alertController
        .create({
          title: 'Enter spending password',
          cssClass: highlightInvalid ? 'invalid-input-prompt' : '',
          inputs: [
            {
              name: 'password',
              placeholder: 'Password',
              type: 'password',
            },
          ],
          buttons: [
            {
              text: 'Cancel',
              role: 'cancel',
              handler: () => {
                this.navCtrl.pop();
              },
            },
            {
              text: 'Ok',
              handler: data => {
                if (!data.password) {
                  showPassPrompt(true);
                } else {
                  this.walletService
                    .decrypt(this.txData.wallet, data.password)
                    .then(() => {
                      this.send();
                    })
                    .catch(err => {
                      showPassPrompt(true);
                    });
                }
              },
            },
          ],
        })
        .present();
    };

    let showNoPassPrompt = () => {
      this.alertController
        .create({
          title: 'Confirm Send',
          subTitle: 'Are you sure that you want to proceed with this transaction?',
          buttons: [
            {
              text: 'Cancel',
              role: 'cancel',
              handler: () => {
                this.navCtrl.pop();
              },
            },
            {
              text: 'Ok',
              handler: () => {
                this.send();
              },
            },
          ],
        })
        .present();
    };

    let showTouchIDPrompt = () => {
      // TODO check if we need this
      //this.alertController.create({
      //  title: 'TouId required',
      //  subTitle: 'Confirm transaction by your fingerprint',
      //  buttons: [
      //      { text: 'Cancel', role: 'cancel',handler: () => { this.navCtrl.pop(); } }
      //  ]
      //}).present();

      this.touchIdService
        .check()
        .then(() => {
          return this.send();
        })
        .catch(() => {
          this.navCtrl.pop();
        });
    };

    if (this.walletService.isEncrypted(this.txData.wallet)) {
      return showPassPrompt();
    } else {

      // if (parseInt(this.txData.amountUSD) >= this.CONFIRM_LIMIT_USD) {
        if (this.touchIdService.isAvailable()) {
          return showTouchIDPrompt();
        } else {
          return showNoPassPrompt();
        }
      // }
    }
  }


  async send() {
    const loadingSpinner = this.loadingCtrl.create({
      content: 'Sending transaction...',
      dismissOnPageChange: true,
    });
    loadingSpinner.present();

    try {

      if (this.txData.referralsToSign) {
        for (let referral of this.txData.referralsToSign) {
          await this.txData.wallet.sendReferral(referral);
          await this.txData.wallet.sendInvite(referral.address);
        }
      }
      await this.approveTx();

      if (this.txData.sendMethod.type == SendMethodType.Easy) {
        this.navCtrl.push('EasySendShareView', { txData: this.txData });
      } else {
        this.navCtrl.popToRoot();
        this.toastCtrl.create({
          message: 'Your transaction is complete',
          cssClass: ToastConfig.CLASS_SUCCESS
        }).present();
      }
    } catch (err) {
      this.logger.warn(err);
      return this.toastCtrl.create({
        message: err,
        cssClass: ToastConfig.CLASS_ERROR,
      }).present();
    } finally {
      loadingSpinner.dismiss();
      this.txData.referralsToSign = [];
    }
  }

  private approveTx() {
    if (!this.txData.wallet.canSign() && !this.txData.wallet.isPrivKeyExternal()) {
      this.logger.info('No signing proposal: No private key');
      return this.walletService.onlyPublish(this.txData.wallet, this.txData.txp);
    } else {
      return this.walletService.publishAndSign(this.txData.wallet, this.txData.txp);
    }
  }

  getContactInitials(contact) {
    if (!contact.name || !contact.name.formatted) return '';
    let nameParts = contact.name.formatted.toUpperCase().replace(/\s\s+/g, ' ').split(' ');
    let name = nameParts[0].charAt(0);
    if (nameParts[1]) name += ' ' + nameParts[1].charAt(0);
    return name;
  }

}
