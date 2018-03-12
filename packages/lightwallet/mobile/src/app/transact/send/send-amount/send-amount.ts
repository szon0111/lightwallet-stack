import { Component } from '@angular/core';
import {
  AlertController,
  IonicPage,
  LoadingController,
  ModalController,
  NavController,
  NavParams
} from 'ionic-angular';
import * as _ from 'lodash';
import { MeritContact } from '@merit/common/models/merit-contact';
import { EasyReceipt } from '@merit/common/models/easy-receipt';
import { ConfigService } from '@merit/common/services/config.service';
import { RateService } from '@merit/common/services/rate.service';
import { FeeService } from '@merit/common/services/fee.service';
import { ProfileService } from '@merit/common/services/profile.service';
import { TxFormatService } from '@merit/common/services/tx-format.service';
import { EasySendService } from '@merit/common/services/easy-send.service';
import { EasyReceiveService } from '@merit/common/services/easy-receive.service';
import { SendService } from '@merit/common/services/send.service';
import { WalletService } from '@merit/common/services/wallet.service';
import { LoggerService } from '@merit/common/services/logger.service';
import { MERIT_MODAL_OPTS } from '@merit/common/utils/constants';
import { getEasySendURL } from '@merit/common/models/easy-send';
import { ISendMethod, SendMethodType } from '@merit/common/models/send-method';
import { MeritToastController, ToastConfig } from '@merit/common/services/toast.controller.service';
import { ENV } from '@app/env';

@IonicPage()
@Component({
  selector: 'view-send-amount',
  templateUrl: 'send-amount.html',
})
export class SendAmountView {
  public recipient: MeritContact;
  public sendMethod: ISendMethod;

  public availableUnits: Array<{ type: string, name: string }>;
  public selectedCurrency: { type: string, name: string };

  public txData: any;
  public feeCalcError: string;
  public feeLoading: boolean;

  public amount = { micros: 0, mrt: 0, mrtStr: '0.00', fiat: 0, fiatStr: '0.00' };
  public formData = { amount: '0.00', password: '', confirmPassword: '', nbBlocks: 1008, validTill: '' };

  public readonly CURRENCY_TYPE_MRT = 'mrt';
  public readonly CURRENCY_TYPE_FIAT = 'fiat';

  public readonly MINUTE_PER_BLOCK = 1;

  public availableAmountMicros: number = 0;

  public wallets: Array<any>;
  public selectedWallet: any;

  public knownFeeLevels: Array<{ level: string, nbBlocks: number, feePerKb: number }>;
  public selectedFeeLevel: string = 'normal';
  public selectedFee: any;

  public suggestedAmounts = {};
  public lastAmount: string;

  public feeIncluded: boolean;
  private referralsToSign: Array<any>;

  private allowUnconfirmed: boolean = true;

  private loading: boolean;

  constructor(private navCtrl: NavController,
              private navParams: NavParams,
              private configService: ConfigService,
              private rateService: RateService,
              private feeService: FeeService,
              private profileService: ProfileService,
              private txFormatService: TxFormatService,
              private modalCtrl: ModalController,
              private toastCtrl: MeritToastController,
              private alertCtrl: AlertController,
              private easySendService: EasySendService,
              private easyReceiveSerivce: EasyReceiveService,
              private walletService: WalletService,
              private loadingCtrl: LoadingController,
              private logger: LoggerService,
              private sendService: SendService
            ) {
    this.recipient = this.navParams.get('contact');
    this.sendMethod = this.navParams.get('suggestedMethod');
    this.loading = true;
  }

  async ionViewDidLoad() {
    this.availableUnits = [
      { type: this.CURRENCY_TYPE_MRT, name: this.configService.get().wallet.settings.unitCode.toUpperCase() }
    ];
    if (this.rateService.getRate(this.configService.get().wallet.settings.alternativeIsoCode) > 0) {
      this.availableUnits.push({
        type: this.CURRENCY_TYPE_FIAT,
        name: this.configService.get().wallet.settings.alternativeIsoCode.toUpperCase()
      });
    }
    this.selectedCurrency = this.availableUnits[0];
    let passedAmount = this.navParams.get('amount') || 0;
    this.formData.amount = String(this.rateService.microsToMrt(passedAmount));
    await this.updateAmount();

    // todo add smart common amounts receive
    this.suggestedAmounts[this.CURRENCY_TYPE_MRT] = ['5', '10', '100'];
    this.suggestedAmounts[this.CURRENCY_TYPE_FIAT] = ['5', '10', '100'];

    this.wallets = await this.profileService.getWallets();
    await this.chooseAppropriateWallet();
    this.knownFeeLevels = await this.feeService.getFeeLevels(this.selectedWallet.network);
    this.loading = false;
  }

  private chooseAppropriateWallet() {
    if (this.wallets && this.wallets[0]) {

      this.selectedWallet = this.wallets[0];

      this.wallets.some((wallet) => {
        let amount = this.navParams.get('amount') || 0;
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

  selectWallet() {
    const modal = this.modalCtrl.create('SelectWalletModal',
      {
        selectedWallet: this.selectedWallet,
        availableWallets: this.wallets
      }, MERIT_MODAL_OPTS);
    modal.present();
    modal.onDidDismiss(async (wallet) => {
      if (wallet) {
        wallet.status = await this.walletService.getStatus(this.selectedWallet, { force: true });
        this.selectedWallet = wallet;
      }
      this.updateTxData();
    });
  }

  selectFee() {
    if (!this.txData || !this.txData.txp) return;
    const modal = this.modalCtrl.create('SendFeeView',
      {
        feeLevels: this.txData.txp.availableFeeLevels,
        selectedFeeLevelName: this.selectedFeeLevel
      }, MERIT_MODAL_OPTS);
    modal.present();
    modal.onDidDismiss((data) => {
      if (data) {
        this.selectedFeeLevel = data.name;
        this.selectedFee = data;
        this.txData.txp.fee = data.micros;
        this.updateTxData();
      }
    });
  }

  showFeeIncludedTooltip() {
    this.alertCtrl.create({
      title: 'Include fee',
      message: 'If you choose this option, amount size that recipient receives will be reduced by fee size. Otherwise fee will be charged from your balance'
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

  async selectAmount(amount: string) {
    let micros: number;

    if (this.selectedCurrency.type == this.CURRENCY_TYPE_MRT) {
      micros = this.rateService.mrtToMicro(parseFloat(amount));
    } else {
      micros = this.rateService.fromFiatToMicros(parseFloat(amount), this.availableUnits[1].name);
    }

    if (micros > this.selectedWallet.status.spendableAmount) {
      micros = this.selectedWallet.status.spendableAmount;
      if (this.selectedCurrency.type == this.CURRENCY_TYPE_MRT) {
        this.formData.amount = String(this.rateService.microsToMrt(micros));
      } else {
        this.formData.amount = String(this.rateService.fromMicrosToFiat(micros, this.availableUnits[1].name));
      }
    } else {
      this.formData.amount = amount;
    }

    await this.updateAmount();
    return this.updateTxData();
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
      this.amount.mrt = parseFloat(this.formData.amount) || 0;
      this.amount.micros = this.rateService.mrtToMicro(this.amount.mrt);
      if (this.availableUnits[1]) {
        this.amount.fiat = this.rateService.fromMicrosToFiat(this.amount.micros, this.availableUnits[1].name);
      }
    } else {
      this.amount.fiat = parseFloat(this.formData.amount) || 0;
      this.amount.micros = this.rateService.fromFiatToMicros(this.amount.fiat, this.availableUnits[1].name);
      this.amount.mrt = this.rateService.fromFiatToMerit(this.amount.fiat, this.availableUnits[1].name);
    }
    this.amount.mrtStr = this.txFormatService.formatAmountStr(this.amount.micros) + ' MRT';
    this.amount.fiatStr = await this.txFormatService.formatAlternativeStr(this.amount.micros);

    if (this.selectedWallet && this.selectedWallet.status) {
      if (this.amount.micros == this.selectedWallet.status.spendableAmount) this.feeIncluded = true;
    }

    return this.amount;
  }

  public toggleFeeIncluded() {
  }

  public isSendAllowed() {
    return (
      this.amount.micros > 0
      && !_.isNil(this.txData)
      && !_.isNil(this.txData.txp)
    );
  }

  public async toConfirm() {

    if (this.formData.password != this.formData.confirmPassword) {
      return this.toastCtrl.create({
        message: 'Passwords do not match',
        cssClass: ToastConfig.CLASS_ERROR
      }).present();
    } else {
      this.txData.password = this.formData.password;
    }

    let loadingSpinner = this.loadingCtrl.create({
      content: 'Preparing transaction...',
      dismissOnPageChange: true
    });
    loadingSpinner.present();
    try {
      this.txData.txp = this.sendService.finalizeTxp(this.txData.wallet, this.txData.txp, this.txData.feeIncluded);
      this.navCtrl.push('SendConfirmationView', { txData: this.txData, referralsToSign: this.referralsToSign });
    } catch (e) {
      this.logger.warn(e);
    } finally {
      loadingSpinner.dismiss();
    }

  }

  selectExpirationDate() {
    const modal = this.modalCtrl.create('SendValidTillView', { nbBlocks: this.formData.nbBlocks }, MERIT_MODAL_OPTS);
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
      this.selectedFee = null;
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

      this.createTxpDebounce({ dryRun: true });
    }
  }

  private createTxpDebounce = _.debounce((opts: { dryRun: boolean }) => {
    this.createTxp(opts);
  }, 1000);

  private async createTxp(opts: { dryRun: boolean }) {

    if (this.amount.micros == this.selectedWallet.status.spendableAmount) this.feeIncluded = true;

    if (this.sendMethod.type == SendMethodType.Easy) {

      const easySend = await  this.easySendService.createEasySendScriptHash(this.txData.wallet, this.formData.password);
      easySend.script.isOutput = true;
      this.txData.txp = this.easySendService.prepareTxp(this.txData.wallet, this.amount.micros, easySend);
      this.txData.easySend = easySend;
      this.txData.easySendUrl = getEasySendURL(easySend);
      this.txData.referralsToSign = [easySend.scriptReferralOpts];

      const testEasyScript = this.easyReceiveSerivce.generateEasyScipt(new EasyReceipt({
        secret: easySend.secret,
        senderPublicKey: easySend.senderPubKey,
        blockTimeout: easySend.blockTimeout
      }), this.txData.password, ENV.network);

      const testEasyTxData = { //creating fake data for easy redeem tx so we can estimate fee
        toAddress: this.txData.wallet.getRootAddress(),
        input: {
          senderPublicKey: easySend.senderPubKey,
          script: testEasyScript.script,
          privateKey: testEasyScript.privateKey
        },
        txn: {
          invite: false,
          amount: this.txData.amount,
          txId: '',
          index: 0
        }
      };
      const redeemTxp = this.easyReceiveSerivce
        .buildEasySendRedeemTransaction(testEasyTxData.input, testEasyTxData.txn, testEasyTxData.toAddress);

      this.txData.txp = this.txData.txp.fee + this.feeService.getTxpFee(redeemTxp);
      

    } else {

      this.txData.txp = await this.sendService.prepareTxp(this.txData.walltet, this.amount.micros, this.txData.recipient.address);

    }
  }

}
