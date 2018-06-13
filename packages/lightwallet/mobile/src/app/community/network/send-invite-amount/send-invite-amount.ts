import { Component, ElementRef, ViewChild } from '@angular/core';
import { SocialSharing } from '@ionic-native/social-sharing';
import { MeritWalletClient } from '@merit/common/merit-wallet-client';
import { getEasySendURL } from '@merit/common/models/easy-send';
import { EasySendService } from '@merit/common/services/easy-send.service';
import { ProfileService } from '@merit/common/services/profile.service';
import { IMeritToastConfig, ToastControllerService } from '@merit/common/services/toast-controller.service';
import { WalletService } from '@merit/common/services/wallet.service';
import { MERIT_MODAL_OPTS } from '@merit/common/utils/constants';
import {
  AlertController,
  IonicPage,
  LoadingController,
  ModalController,
  NavController,
  NavParams,
  Platform
} from 'ionic-angular';

@IonicPage()
@Component({
  selector: 'view-send-invite-amount',
  templateUrl: 'send-invite-amount.html'
})
export class SendInviteAmountView {

  wallets: Array<MeritWalletClient>;
  wallet: MeritWalletClient;
  formData = {
    amount: null
  };
  address;
  error: string;
  link: string;
  copied: boolean;
  showShareButton: boolean;
  amountFocused: boolean;

  @ViewChild('amount') amountInput: ElementRef;

  constructor(private navCtrl: NavController,
              private navParams: NavParams,
              private profileService: ProfileService,
              private toastCtrl: ToastControllerService,
              private loadCtrl: LoadingController,
              private modalCtrl: ModalController,
              private alertCtrl: AlertController,
              private socialSharing: SocialSharing,
              private platform: Platform,
              private easySendService: EasySendService,
              private walletService: WalletService
  ) {
    this.address = this.navParams.get('address');
    this.showShareButton = this.platform.is('cordova') && SocialSharing.installed();
  }

  async ionViewWillEnter() {
    this.wallets = await this.profileService.getWallets();
    this.wallet = this.wallets.find(w => w.availableInvites > 0);
    if (!this.wallet) {
      this.error = 'You have no wallets with available invites now';
    }
  }

  ionViewDidEnter() {
    this.focusInput();
  }

  async send() {
    if (!this.wallet) {
      this.wallet = this.wallets.find(w => (w.availableInvites > 0));
    }
    if (!this.wallet || !this.wallet.availableInvites) {
      return this.toastCtrl.error('You have no active invites');
    }

    if (this.wallet.availableInvites < this.formData.amount) {
      return this.toastCtrl.error('You don\'t have enough invites in your wallet for this transaction.');
    }

    const loader = this.loadCtrl.create({ content: 'Creating MeritInvite link...' });
    try {
      loader.present();

      const easySend = await this.walletService.sendMeritInvite(this.wallet, this.formData.amount);

      this.link = getEasySendURL(easySend);
      this.wallet.availableInvites -= this.formData.amount;

    } catch (e) {
      console.log(e);
      this.toastCtrl.error('Failed to send invite');
    } finally {
      loader.dismiss();
    }
  }

  selectWallet() {
    const modal = this.modalCtrl.create('SelectWalletModal', {
      selectedWallet: this.wallet,
      showInvites: true,
      availableWallets: this.wallets.filter(wallet => wallet.availableInvites > 0)
    }, MERIT_MODAL_OPTS);
    modal.onDidDismiss((wallet) => {
      if (wallet) {
        this.wallet = wallet;
        this.processAmount(this.formData.amount);
      }
    });
    return modal.present();
  }

  processAmount(amount) {
    this.error = '';
    if (amount > this.wallet.availableInvites) {
      this.error = 'Not enough invites';
    }
  }

  amountKeypress(key) {
    if (key == 13) return this.amountInput['_native']['nativeElement'].blur();
  }

  focusInput() {
    this.amountInput['_native']['nativeElement'].focus();
  }


  copyToClipboard() {
    this.copied = true;
    this.toastCtrl.success('Copied to clipboard');
  }


  async toWallets() {
    if (this.copied) {
      this.navCtrl.pop();
    } else {
      this.alertCtrl.create({
        title: 'Have you copied/shared your link?',
        message: 'Do not forget to copy or share your link, or you can lose invite',
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          {
            text: 'Ok', handler: () => {
              this.navCtrl.pop();
            }
          }
        ]
      }).present();
    }
  }

  isSendAllowed() {
    return (
      !this.error && this.formData.amount
    );
  }

}
