import { Component } from '@angular/core';
import {
  AlertController,
  IonicPage,
  LoadingController,
  ModalController,
  NavController,
  NavParams
} from 'ionic-angular';
import { ENV } from '@app/env';
import * as _ from 'lodash';
import { ConfigService } from '@merit/common/services/config.service';
import { WalletService } from '@merit/common/services/wallet.service';
import { LoggerService } from '@merit/common/services/logger.service';
import { PushNotificationsService } from '@merit/mobile/app/core/notification/push-notification.service';
import { PollingNotificationsService } from '@merit/mobile/app/core/notification/polling-notification.service';
import { cleanAddress, isAlias } from '@merit/common/utils/addresses';
import { MeritToastController, ToastConfig } from '@merit/common/services/toast.controller.service';
import { SendService } from '@merit/common/services/send.service';

@IonicPage({
  defaultHistory: ['WalletsView']
})
@Component({
  selector: 'view-create-wallet',
  templateUrl: 'create-wallet.html',
})
export class CreateWalletView {

  formData = {
    walletName: '',
    parentAddress: '',
    alias: '',
    aliasValidationError: '',
    aliasCheckInProgress: false,
    addressCheckError: '',
    addressCheckInProgress: false,
    bwsurl: ENV.mwsUrl,
    recoveryPhrase: '',
    password: '',
    repeatPassword: '',
    color: '',
    hideBalance: false
  };

  parsedAddress: string;
  defaultBwsUrl: string = ENV.mwsUrl;

  constructor(private navCtrl: NavController,
              private navParams: NavParams,
              private config: ConfigService,
              private walletService: WalletService,
              private loadCtrl: LoadingController,
              private toastCtrl: MeritToastController,
              private modalCtrl: ModalController,
              private logger: LoggerService,
              private pushNotificationService: PushNotificationsService,
              private pollingNotificationService: PollingNotificationsService,
              private alertCtrl: AlertController,
              private sendService: SendService) {
  }

  ionViewDidEnter() {
    let parentAddress = this.navParams.get('parentAddress');
    if (!_.isNil(parentAddress)) {
      this.formData.parentAddress = parentAddress.toString();
    }
    this.validateParentAddress();
  }

  isCreationEnabled() {
    return (
      this.formData.parentAddress
      && this.formData.walletName
      && !this.formData.aliasCheckInProgress
      && !this.formData.aliasValidationError
      && !this.formData.addressCheckInProgress
      && !this.formData.addressCheckError
    );
  }

  selectColor() {
    let modal = this.modalCtrl.create('SelectColorView', { color: this.formData.color });
    modal.onDidDismiss((color) => {
      if (color) {
        this.formData.color = color;
      }
    });
    modal.present();
  }

  showAliasTooltip() {
    return this.showTooltip('Add an alias',
      'Add alias to your address, so people can recognize you and type something like "@merituser" instead of address.');
  }

  private showTooltip(title, message) {
    return this.alertCtrl.create({
      title, message,
      buttons: ['Got it']
    }).present();
  }

  checkAlias() {
    this.formData.aliasCheckInProgress = true;
    this.validateAliasDebounce();
  }

  checkParentAddress() {
    this.formData.addressCheckInProgress = true;
    this.validateAddressDebounce();
  }

  private validateAliasDebounce = _.debounce(() => {
    this.validateAlias();
  }, 750);
  private validateAddressDebounce = _.debounce(() => {
    this.validateParentAddress();
  }, 750);

  private async validateParentAddress() {
    this.formData.parentAddress = cleanAddress(this.formData.parentAddress);
    let input = (this.formData.parentAddress && isAlias(this.formData.parentAddress)) ? this.formData.parentAddress.slice(1) : this.formData.parentAddress;

    if (!input) {
      this.formData.addressCheckInProgress = false;
      return this.formData.addressCheckError = 'Address cannot be empty';
    } else if (!this.sendService.isAddress(input)) {
      if (!this.sendService.couldBeAlias(input)) {
        this.formData.addressCheckInProgress = false;
        return this.formData.addressCheckError = 'Incorrect address or alias format';
      } else {
        let aliasInfo = await this.sendService.getAddressInfo(input);
        if (!aliasInfo || !aliasInfo.isValid || !aliasInfo.isBeaconed || !aliasInfo.isConfirmed) {
          this.formData.addressCheckInProgress = false;
          return this.formData.addressCheckError = 'Alias not found';
        } else {
          this.formData.addressCheckError = null;
          this.formData.addressCheckInProgress = false;
          return this.parsedAddress = aliasInfo.address;
        }
      }
    } else {
      let addressInfo = await this.sendService.getAddressInfo(input);
      if (!addressInfo || !addressInfo.isValid || !addressInfo.isBeaconed || !addressInfo.isConfirmed) {
        this.formData.addressCheckInProgress = false;
        return this.formData.addressCheckError = 'Address not found';
      } else {
        this.formData.addressCheckError = null;
        this.formData.addressCheckInProgress = false;
        return this.parsedAddress = addressInfo.address;
      }
    }


  }

  private async validateAlias() {
    this.formData.alias = cleanAddress(this.formData.alias);

    let input = (this.formData.alias && isAlias(this.formData.alias)) ? this.formData.alias.slice(1) : this.formData.alias;

    if (!input) {
      this.validateAliasDebounce.cancel();
      this.formData.aliasCheckInProgress = false;
      return this.formData.aliasValidationError = null;
    }

    if (input.length < 4) {
      this.validateAliasDebounce.cancel();
      this.formData.aliasCheckInProgress = false;
      return this.formData.aliasValidationError = 'Alias should contain at least 4 symbols';
    }

    if (!this.sendService.couldBeAlias(input)) {
      this.validateAliasDebounce.cancel();
      this.formData.aliasCheckInProgress = false;
      return this.formData.aliasValidationError = 'Incorrect alias format';
    }


    let addressExists = await this.sendService.getValidAddress(input);

    if (addressExists) {
      this.formData.aliasCheckInProgress = false;
      return this.formData.aliasValidationError = 'Alias already in use';
    } else {
      this.formData.aliasValidationError = null;
      return this.formData.aliasCheckInProgress = false;
    }


  }

  async createWallet() {

    if (this.formData.password != this.formData.repeatPassword) {
      return this.toastCtrl.create({
        message: `Passwords don't match`,
        cssClass: ToastConfig.CLASS_ERROR
      }).present();
    }

    let alias = (this.formData.alias && isAlias(this.formData.alias)) ? this.formData.alias.slice(1) : this.formData.alias;

    const opts = {
      name: this.formData.walletName,
      parentAddress: this.parsedAddress,
      alias: alias,
      bwsurl: this.formData.bwsurl,
      mnemonic: this.formData.recoveryPhrase,
      networkName: ENV.network,
      m: 1, //todo temp!
      n: 1 //todo temp!
    };

    let loader = this.loadCtrl.create({
      content: 'Creating wallet'
    });

    await loader.present();

    try {
      const wallet = await this.walletService.createWallet(opts);
      // Subscribe to push notifications or to long-polling for this wallet.
      if (this.config.get().pushNotificationsEnabled) {
        this.logger.info('Subscribing to push notifications for default wallet');
        this.pushNotificationService.subscribe(wallet);
      } else {
        this.logger.info('Subscribing to long polling for default wallet');
        this.pollingNotificationService.enablePolling(wallet);
      }

      let promises: Promise<any>[] = [];
      if (this.formData.hideBalance) {
        promises.push(this.walletService.setHiddenBalanceOption(wallet.id, this.formData.hideBalance));
      }

      if (this.formData.password) {
        promises.push(this.walletService.encrypt(wallet, this.formData.password));
      }

      if (this.formData.color) {
        const colorOpts = {
          colorFor: {
            [wallet.id]: this.formData.color
          }
        };
        promises.push(this.config.set(colorOpts));
      }

      try {
        await Promise.all(promises);
      } catch (e) {
        this.logger.error(e);
      }

      // We should callback to the wallets list page to let it know that there is a new wallet
      // and that it should updat it's list.
      const callback = this.navParams.get('updateWalletListCB');
      await loader.dismiss();
      await callback();
      return this.navCtrl.pop();
    } catch (err) {
      this.logger.error(err);
      await loader.dismiss();
      await this.toastCtrl.create({
        message: err.text || 'Error occured when creating wallet',
        cssClass: ToastConfig.CLASS_ERROR
      }).present();
    }
  }
}