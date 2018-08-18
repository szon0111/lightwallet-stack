import { Component, OnInit } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IRootAppState } from '@merit/common/reducers';
import { AddressService } from '@merit/common/services/address.service';
import { ConfigService } from '@merit/common/services/config.service';
import { EasySendService } from '@merit/common/services/easy-send.service';
import { FeeService } from '@merit/common/services/fee.service';
import { LoggerService } from '@merit/common/services/logger.service';
import { MWCService } from '@merit/common/services/mwc.service';
import { PersistenceService2 } from '@merit/common/services/persistence2.service';
import { RateService } from '@merit/common/services/rate.service';
import { SendService } from '@merit/common/services/send.service';
import { ToastControllerService } from '@merit/common/services/toast-controller.service';
import { WalletService } from '@merit/common/services/wallet.service';
import { PasswordPromptController } from '@merit/desktop/app/components/password-prompt/password-prompt.controller';
import { Store } from '@ngrx/store';
import 'rxjs/add/operator/isEmpty';
import 'rxjs/add/operator/toPromise';
import { take } from 'rxjs/operators';
import { SendFormController } from '@merit/common/controllers/send-form.controller';
import { LoadingControllerService } from '@merit/common/services/loading-controller.service';

@Component({
  selector: 'view-send',
  templateUrl: './send.view.html',
  styleUrls: ['./send.view.sass'],
})
export class SendView implements OnInit {
  ctrl: SendFormController;

  get amountMrt() {
    return this.ctrl.formData.get('amountMrt');
  }

  get selectedCurrency() {
    return this.ctrl.formData.get('selectedCurrency');
  }

  get feeIncluded() {
    return this.ctrl.formData.get('feeIncluded');
  }

  get wallet() {
    return this.ctrl.formData.get('wallet');
  }

  get type() {
    return this.ctrl.formData.get('type');
  }

  get password() {
    return this.ctrl.formData.get('password');
  }

  get passwordConfirm() {
    return this.ctrl.formData.get('passwordConfirm');
  }

  get address() {
    return this.ctrl.formData.get('address');
  }

  get destination() {
    return this.ctrl.formData.get('destination');
  }

  showTour: boolean = !('showTour' in localStorage && localStorage.getItem('showTour') === 'false');

  constructor(
    private route: ActivatedRoute,
    private store: Store<IRootAppState>,
    private formBuilder: FormBuilder,
    private logger: LoggerService,
    private rateService: RateService,
    private configService: ConfigService,
    private walletService: WalletService,
    private passwordPromptCtrl: PasswordPromptController,
    private addressService: AddressService,
    private easySendService: EasySendService,
    private sendService: SendService,
    private feeService: FeeService,
    private persistenceService: PersistenceService2,
    private mwcService: MWCService,
    private toastCtrl: ToastControllerService,
    private loadingCtrl: LoadingControllerService,
  ) {
    this.ctrl = new SendFormController(store, formBuilder, sendService, logger, loadingCtrl, toastCtrl, rateService);
  }

  async ngOnInit() {
    await this.ctrl.init();

    const query = await this.route.queryParams.pipe(take(1)).toPromise();
    const amount = parseFloat(query.amount);

    if (amount) {
      this.amountMrt.patchValue(amount);
      this.amountMrt.setErrors(null);
      this.amountMrt.markAsDirty();
    }
  }

  hideTour() {
    this.showTour = false;
    localStorage.setItem('showTour', 'false');
  }
}
