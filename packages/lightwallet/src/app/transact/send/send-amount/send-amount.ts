import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams, ModalController, AlertController, LoadingController } from 'ionic-angular';
import { MeritContact } from 'merit/shared/address-book/merit-contact.model';
import * as _ from 'lodash';
import { SendMethod } from 'merit/transact/send/send-method.model';
import { ConfigService } from "merit/shared/config.service";
import { RateService } from 'merit/transact/rate.service';
import { FeeService } from 'merit/shared/fee/fee.service'
import { ProfileService } from "merit/core/profile.service";
import { TxFormatService } from "merit/transact/tx-format.service";

import { MeritToastController } from "merit/core/toast.controller";
import { ToastConfig } from "merit/core/toast.config";
import { EasySendService } from 'merit/transact/send/easy-send/easy-send.service';
import { WalletService } from 'merit/wallets/wallet.service';
import { EasySend, easySendURL } from 'merit/transact/send/easy-send/easy-send.model'
import { Logger } from 'merit/core/logger';



@IonicPage()
@Component({
  selector: 'view-send-amount',
  templateUrl: 'send-amount.html',
})
export class SendAmountView {
  public recipient:MeritContact;
  public sendMethod:SendMethod;

  public availableUnits:Array<{type:string, name:string}>;
  public selectedCurrency:{type:string, name:string};

  public txData:any;
  public feeCalcError:string;
  public feeLoading:boolean;

  public amount = {micros: 0, mrt:0, mrtStr:'0.00', fiat:0, fiatStr:'0.00'};
  public formData = {amount: '0.00', password: '', confirmPassword: '', nbBlocks: 1008, validTill: ''};

  public readonly CURRENCY_TYPE_MRT = 'mrt';
  public readonly CURRENCY_TYPE_FIAT = 'fiat';
  public readonly AMOUNT_MAX = 'All';

  public readonly MINUTE_PER_BLOCK = 1;

  public availableAmountMicros:number = 0;

  public wallets:Array<any>;
  public selectedWallet:any;

  public knownFeeLevels:Array<{level:string, nbBlocks:number, feePerKb:number}>;
  public selectedFeeLevel:string = 'normal';
  public selectedFee:{level:string, nbBlocks:number, feePerKb:number, micros:number, minutes:number, description: string, name:string, mrt:number,percent: number};

  public suggestedAmounts = {};
  public lastAmount:string;

  public feeIncluded:boolean;
  private referralsToSign: Array<any>;

  private allowUnconfirmed:boolean;

  private loading:boolean;

  constructor(
    private navCtrl: NavController,
    private navParams: NavParams,
    private configService: ConfigService,
    private rateService: RateService,
    private feeService: FeeService,
    private profileService: ProfileService,
    private txFormatService:TxFormatService,
    private modalCtrl: ModalController,
    private toastCtrl: MeritToastController,
    private alertCtrl: AlertController,
    private easySendService: EasySendService,
    private walletService: WalletService,
    private loadingCtrl: LoadingController,
    private logger: Logger
  ) {
    this.recipient = this.navParams.get('contact');
    this.sendMethod = this.navParams.get('suggestedMethod');
    this.loading = true;
  }

  async ionViewDidLoad() {
    this.availableUnits = [
      {type: this.CURRENCY_TYPE_MRT, name: this.configService.get().wallet.settings.unitCode.toUpperCase()},
      {type: this.CURRENCY_TYPE_FIAT, name: this.configService.get().wallet.settings.alternativeIsoCode.toUpperCase()},
    ];
    this.selectedCurrency = this.availableUnits[0];
    this.amount.micros = this.navParams.get('suggestedMethod') || 0;
    await this.updateAmount();

    // todo add smart common amounts receive
    this.suggestedAmounts[this.CURRENCY_TYPE_MRT] =  ['5', '10', '100', this.AMOUNT_MAX];
    this.suggestedAmounts[this.CURRENCY_TYPE_FIAT] = ['5', '10', '100', this.AMOUNT_MAX];

    this.wallets = await this.profileService.getWallets();
    await this.chooseAppropriateWallet();
    this.knownFeeLevels = await this.feeService.getFeeLevels(this.selectedWallet.network);
    this.loading = false;
  }

  private chooseAppropriateWallet() {
    if (this.wallets && this.wallets[0]) {

      this.selectedWallet = this.wallets[0];

      this.wallets.some((wallet) => {
        let amount = this.navParams.get('amount') || 0;;
        if (wallet.status && wallet.status.spendableAmount > amount) {
          this.selectedWallet = wallet;
          return true;
        }
      });

      if (!this.selectedWallet.status) {
        this.walletService.getStatus(this.selectedWallet, { force: true }).then((status) => {
          this.selectedWallet.status = status;
        });
      }
    }
  }

  async selectWallet() {
    let modal = this.modalCtrl.create('SendWalletView', {selectedWallet: this.selectedWallet, availableWallets: this.wallets});
    modal.present();
    modal.onDidDismiss((wallet) => {
      if (wallet) {
        this.selectedWallet = wallet;
        this.walletService.getStatus(this.selectedWallet, { force: true }).then((status) => {
          this.selectedWallet.status = status;
        });
      }
      this.updateTxData();
    });
  }

  selectFee() {
    let modal = this.modalCtrl.create('SendFeeView', {feeLevels: this.txData.txp.availableFeeLevels, selectedFeeLevelName: this.selectedFeeLevel});
    modal.present();
    modal.onDidDismiss((data) => {
      if (data) {
        this.selectedFeeLevel = data.name;
        this.selectedFee = data;
        this.txData.txp.fee = data.micros;
      }
    });
  }

  showFeeIncludedTooltip() {
    this.alertCtrl.create({
      title: 'Include fee',
      message: "If you choose this option, amount size that recipient receives will be reduced by fee size. Otherwise fee will be charged from your balance"
    }).present();
  }

  async selectCurrency(currency) {
    if (currency.type != this.selectedCurrency.type) {
      this.selectedCurrency = currency;
      this.selectAmount(this.formData.amount);
      this.updateAmount();
      await this.updateTxData();
    }
  }

  async selectAmount(amount) {

    let micros = 0;
    if (amount == this.AMOUNT_MAX) {
      micros = this.selectedWallet.status.spendableAmount;
      if (this.selectedCurrency.type == this.CURRENCY_TYPE_MRT) {
        amount = this.rateService.microsToMrt(micros);
      } else {
        amount = this.rateService.fromMicrosToFiat(micros, this.availableUnits[1].name);
      }
    } else {
      if (this.selectedCurrency.type == this.CURRENCY_TYPE_MRT) {
        micros = this.rateService.mrtToMicro(parseFloat(amount));
      } else {
        micros = this.rateService.fromFiatToMicros(parseFloat(amount), this.availableUnits[1].name);
      }
    }

    if (micros > this.selectedWallet.status.spendableAmount) {
      micros = this.selectedWallet.status.spendableAmount;
      if (this.selectedCurrency.type == this.CURRENCY_TYPE_MRT) {
        this.formData.amount  = this.rateService.microsToMrt(micros);
      } else {
        this.formData.amount  = this.rateService.fromMicrosToFiat(micros, this.availableUnits[1].name);
      }
    } else {
      this.formData.amount  = Math.round(amount*100000)/100000;
    }

    await this.updateAmount();
    await this.updateTxData();
  }

  async processAmount(value) {
    if (value != this.lastAmount) {
      this.lastAmount = value;
      await this.updateAmount();
      await this.updateTxData();
    }
  }

  private async updateAmount() {
    if (this.selectedCurrency.type == this.CURRENCY_TYPE_MRT) {
      this.amount.mrt = parseFloat(this.formData.amount);
      this.amount.micros = this.rateService.mrtToMicro(this.amount.mrt);
      this.amount.fiat =  this.rateService.fromMicrosToFiat(this.amount.micros, this.availableUnits[1].name);
    } else {
      this.amount.fiat = parseFloat(this.formData.amount);
      this.amount.micros = this.rateService.fromFiatToMicros(this.amount.fiat, this.availableUnits[1].name);
      this.amount.mrt =  this.rateService.fromFiatToMerit(this.amount.fiat, this.availableUnits[1].name);
    }
    this.amount.mrtStr = this.txFormatService.formatAmountStr(this.amount.micros)+' MRT';
    this.amount.fiatStr = await this.txFormatService.formatAlternativeStr(this.amount.micros);

    if (this.selectedWallet && this.selectedWallet.status) {
      if (this.amount.micros == this.selectedWallet.status.spendableAmount) this.feeIncluded = true;
    }

    return this.amount;
  }

  public toggleFeeIncluded() {
    this.updateTxData();
  }

  public isSendAllowed() {
    return (
      this.amount.micros > 0
      && !_.isNil(this.txData)
      && !_.isNil(this.txData.txp)
    )
  }

  public toConfirm() {

    if (this.formData.password != this.formData.confirmPassword) {
      return  this.toastCtrl.create({
        message: 'Passwords do not match',
        cssClass: ToastConfig.CLASS_ERROR
      }).present();
    } else {
      this.txData.password = this.formData.password;
    }

    let loadingSpinner = this.loadingCtrl.create({
      content: "Preparing transaction...",
      dismissOnPageChange: true
    });
    loadingSpinner.present();
    this.createTxp({dryRun:false}).then(() => {
      loadingSpinner.dismiss();
      this.navCtrl.push('SendConfirmationView', {txData: this.txData, referralsToSign: this.referralsToSign});
    }).catch(() => {
      loadingSpinner.dismiss();
    });
  }

  public  selectExpirationDate() {
    let modal = this.modalCtrl.create('SendValidTillView', {nbBlocks: this.formData.nbBlocks});
    modal.present();
    modal.onDidDismiss((nbBlocks) => {
      if (nbBlocks) this.formData.nbBlocks = nbBlocks;
      this.updateTxData();
    });
  }

  private updateTxData() {
    this.feeLoading = true;
    this.feeCalcError = null;

    if (!this.amount.micros) {
      this.txData = null;
      this.feeLoading = false;
      return this.createTxpDebounce.cancel();
    } else if (this.amount.micros > this.selectedWallet.status.spendableAmount) {
      this.feeCalcError = 'Amount is too big';
      this.txData = null;
      this.feeLoading = false;
      return this.createTxpDebounce.cancel();
    } else {
      this.txData = {
        txp: null,
        wallet: this.selectedWallet,
        amount: this.amount.micros,
        feeAmount: null,
        password: this.formData.password,
        totalAmount: this.amount.micros,
        recipient: this.recipient,
        sendMethod: this.sendMethod,
        feeIncluded: this.feeIncluded,
        timeout: this.formData.nbBlocks
      };

      this.createTxpDebounce({dryRun:true});
    }
  }

  private createTxpDebounce = _.debounce((opts:{dryRun:boolean}) => {
    this.createTxp(opts);
  }, 1000);

  private async createTxp(opts:{dryRun:boolean}) {

    try {
      let data:any = {
        toAddress: this.txData.recipient.meritAddress,
        toName: this.txData.recipient.name || '',
        toAmount: this.txData.amount,
        allowSpendUnconfirmed: this.allowUnconfirmed,
        feeLevel: this.selectedFeeLevel
      };

      if (this.amount.micros == this.selectedWallet.status.spendableAmount) {
        data.sendMax = true;
        data.toAmount = null;
        this.feeIncluded = true;
      }

      let easyData:any = await this.getEasyData();
      data = Object.assign(data, _.pick(easyData, 'script', 'toAddress'));
      data.toAddress = data.toAddress || easyData.scriptAddress;

      let txpOut = await this.getTxp(_.clone(data), this.selectedWallet, opts.dryRun);
      this.txData.txp = txpOut;
      this.txData.easySend = easyData;
      this.referralsToSign = _.filter([easyData.recipientReferralOpts, easyData.scriptReferralOpts]);

      this.txData.txp.availableFeeLevels = [];
      this.knownFeeLevels.forEach((level) => {
        // todo IF EASY ADD  easySend.size*feeLevel.feePerKb !!!!!!
        let micros = txpOut.estimatedSize*level.feePerKb/1000;
        let mrt = this.rateService.microsToMrt(micros);
        //todo add description map
        // todo add blocks per minute const

        // todo check if micros
        let percent = this.feeIncluded ? (micros / (this.amount.micros) * 100) : (micros / (this.amount.micros +  micros) * 100);
        let precision = 1;
        if (percent > 0) {
          while (percent * Math.pow(10, precision) < 1) {
            precision++;
          }
        }
        precision++; //showing two valued digits

        let fee = {description: level.level, name: level.level, minutes: level.nbBlocks*this.MINUTE_PER_BLOCK, micros: micros, mrt: mrt, percent: percent.toFixed(precision) + '%'};
        this.txData.txp.availableFeeLevels.push(fee);
        if (level.level == this.selectedFeeLevel) {
          this.selectedFee = fee;
          this.txData.txp.fee = fee.micros;
        }
      });
    } catch (err) {
      this.txData.txp = null;
      this.logger.warn(err);
      if (err.text) this.feeCalcError = err.text;
      return  this.toastCtrl.create({
        message: err.text || 'Unknown error',
        cssClass: ToastConfig.CLASS_ERROR
      }).present();
    } finally  {
      this.feeLoading = false;
    }


  }

  private getEasyData() {
    if (this.txData.sendMethod.type != SendMethod.TYPE_EASY) {
      return Promise.resolve({});
    } else {
      return this.easySendService.createEasySendScriptHash(this.txData.wallet, this.formData.password).then((easySend) => {
        easySend.script.isOutput = true;
        this.txData.easySendURL = easySendURL(easySend);
        return {
          script: easySend.script,
          toAddress: easySend.scriptAddress.toString(),
          scriptReferralOpts: easySend.scriptReferralOpts,
          recipientReferralOpts: easySend.recipientReferralOpts,
        };
      });
    }
  }

  private getTxp(tx, wallet, dryRun) {
      // ToDo: use a credential's (or fc's) function for this
      if (tx.description && !wallet.credentials.sharedEncryptingKey) {
        return Promise.reject(new Error('Need a shared encryption key to add message!'));
      }

      if (tx.toAmount > Number.MAX_SAFE_INTEGER) {
        return Promise.reject(new Error("The amount is too big")); //.  Because, Javascript.
      }

      let txp:any = {};

      if (tx.script) {
        txp.outputs = [{
          'script': tx.script.toHex(),
          'toAddress': tx.toAddress,
          'amount': tx.toAmount,
          'message': tx.description
        }];
        txp.addressType = 'P2SH';
      } else {
        txp.outputs = [{
          'toAddress': tx.toAddress,
          'amount': tx.toAmount,
          'message': tx.description
        }];
      }

      txp.sendMax = tx.sendMax;
      if (tx.sendMaxInfo) {
        txp.inputs = tx.sendMaxInfo.inputs;
        txp.fee = tx.sendMaxInfo.fee;
      } else {
        if (this.txData.usingCustomFee) {
          txp.feePerKb = tx.feeRate;
        } else txp.feeLevel = tx.feeLevelName;
      }

      txp.message = tx.description;

      if (tx.paypro) {
        txp.payProUrl = tx.paypro.url;
      }
      txp.excludeUnconfirmedUtxos = !tx.allowSpendUnconfirmed;
      txp.dryRun = dryRun;
      if (!dryRun) {
        if (this.feeIncluded) {
          txp.fee = this.txData.feeAmount;
          txp.inputs = this.txData.txp.inputs;
          txp.outputs[0].amount = this.txData.amount - this.txData.feeAmount;
        }
      }
      return this.walletService.createTx(wallet, txp);
  }


}
