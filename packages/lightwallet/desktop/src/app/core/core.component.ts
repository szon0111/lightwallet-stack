import { Component, ViewEncapsulation } from '@angular/core';
import { Validators } from '@angular/forms';
import { ENV } from '@app/env';
import { MeritWalletClient } from '@merit/common/merit-wallet-client';
import { EasyReceipt } from '@merit/common/models/easy-receipt';
import { IRootAppState } from '@merit/common/reducers';
import { RefreshOneWalletAction } from '@merit/common/reducers/wallets.reducer';
import { EasyReceiveService } from '@merit/common/services/easy-receive.service';
import { LoggerService } from '@merit/common/services/logger.service';
import { ProfileService } from '@merit/common/services/profile.service';
import { PushNotificationsService } from '@merit/common/services/push-notification.service';
import { PasswordValidator } from '@merit/common/validators/password.validator';
import { ConfirmDialogControllerService } from '@merit/desktop/app/components/confirm-dialog/confirm-dialog-controller.service';
import { PasswordPromptController } from '@merit/desktop/app/components/password-prompt/password-prompt.controller';
import { ToastControllerService } from '@merit/desktop/app/components/toast-notification/toast-controller.service';
import { Store } from '@ngrx/store';
import { Address, PublicKey } from 'bitcore-lib';

@Component({
  selector: 'view-core',
  templateUrl: './core.component.html',
  styleUrls: ['./core.component.sass'],
  encapsulation: ViewEncapsulation.None
})
export class CoreView {

  topMenuItems: any[] = [
    {
      name: 'Dashboard',
      icon: '/assets/v1/icons/ui/aside-navigation/home.svg',
      link: '/dashboard'
    },
    {
      name: 'Wallets',
      icon: '/assets/v1/icons/ui/aside-navigation/wallet.svg',
      link: '/wallets'
    },
    {
      name: 'Receive Merit',
      icon: '/assets/v1/icons/ui/aside-navigation/receive.svg',
      link: '/receive'
    },
    {
      name: 'Send Merit',
      icon: '/assets/v1/icons/ui/aside-navigation/send.svg',
      link: '/send'
    },
    {
      name: 'History',
      icon: '/assets/v1/icons/ui/aside-navigation/history.svg',
      link: '/history'
    },
    {
      name: 'Community',
      icon: '/assets/v1/icons/ui/aside-navigation/network.svg',
      link: '/community'
    },
    {
      name: 'Settings',
      icon: '/assets/v1/icons/ui/aside-navigation/settings.svg',
      link: '/settings'
    }
  ];
  bottomMenuItems: any[] = [
    {
      name: 'Help & Support',
      icon: '/assets/v1/icons/ui/aside-navigation/info.svg',
      link: 'https://www.merit.me/get-involved/#join-the-conversation'
    }
  ];

  constructor(private pushNotificationsService: PushNotificationsService,
              private easyReceiveService: EasyReceiveService,
              private logger: LoggerService,
              private confirmDialogCtrl: ConfirmDialogControllerService,
              private passwordPromptCtrl: PasswordPromptController,
              private toastCtrl: ToastControllerService,
              private profileService: ProfileService,
              private store: Store<IRootAppState>) {}

  ngOnInit() {
    this.processPendingEasyReceipts();
    this.pushNotificationsService.init();
    this.easyReceiveService.cancelEasySendObservable$.subscribe(
      receipt => {
        this.processEasyReceipt(receipt, '', false);
      });
  }

  ngAfterViewInit() {
    window.history.replaceState({}, document.title, document.location.pathname);
  }

  private showPasswordEasyReceivePrompt(receipt: EasyReceipt, processAll: boolean, wallet?: MeritWalletClient) {
    const message = `You've got merit from ${receipt.senderName}! Please enter transaction password`;
    const passwordPrompt = this.passwordPromptCtrl.create(message, [Validators.required], [PasswordValidator.ValidateEasyReceivePassword(receipt, this.easyReceiveService)]);
    passwordPrompt.onDidDismiss((password: any) => {
      if (password) {
        // Got a password, let's go ahead and process the easy receipt again
        this.processEasyReceipt(receipt, password, processAll, wallet);
      }
    });
  }

  private async showConfirmEasyReceivePrompt(receipt: EasyReceipt, data: any, wallet?: MeritWalletClient) {
    const amount = await this.easyReceiveService.getReceiverAmount(data.txs);
    const message = receipt.senderName.length > 0 ? `@${ receipt.senderName } sent you ${ amount } Merit!` : `You've got ${ amount } Merit!`;
    const confirmDialog = this.confirmDialogCtrl.create(message, 'Would you like to accept this transaction?', [
      {
        text: 'Yes',
        value: 'yes',
        class: 'primary'
      },
      {
        text: 'No',
        value: 'no'
      }
    ]);

    confirmDialog.onDidDismiss((val: string) => {
      if (val === 'yes') {
        // accepted
        this.acceptEasyReceipt(receipt, data, wallet);
      } else if (val === 'no') {
        // decline easy receive
        this.rejectEasyReceipt(receipt, data);
      }
    });
  }

  private async showCancelEasyReceivePrompt(receipt: EasyReceipt, data: any, wallet?: MeritWalletClient) {
    const amount = await this.easyReceiveService.getReceiverAmount(data.txs);

    const confirmDialog = this.confirmDialogCtrl.create(`Cancel GlobalSend with ${ amount } Merit?`, `You clicked on a GlobalSend link that you created.  Would you like to cancel it?`, [
      {
        text: 'Cancel GlobalSend',
        value: 'yes',
        class: 'primary'
      },
      {
        text: 'Don\'t Cancel',
        value: 'no'
      }
    ]);

    confirmDialog.onDidDismiss((val: string) => {
      if (val === 'yes') {
        // accepted
        this.cancelEasyReceipt(receipt, wallet);
      } else {
        this.rejectEasyReceipt(receipt, data);
      }
    });
  }

  // TODO make wallet required
  private async cancelEasyReceipt(receipt: EasyReceipt, wallet?: MeritWalletClient): Promise<any> {
    try {
      wallet = wallet || (await this.profileService.getWallets())[0];
      if (!wallet) throw 'no wallet';

      const password = '';
      const walletPassword = '';

      const acceptanceTx = await this.easyReceiveService.cancelEasySendReceipt(wallet, receipt, password, walletPassword);

      this.logger.info('Accepted easy send', acceptanceTx);
      this.store.dispatch(new RefreshOneWalletAction(wallet.id, {
        skipShareCode: true,
        skipRewards: true,
        skipAlias: true
      }));

    } catch (err) {
      console.log(err);
      this.toastCtrl.error('There was an error cancelling your GlobalSend.');
    }
  }

  private async acceptEasyReceipt(receipt: EasyReceipt, data: any, wallet?: MeritWalletClient): Promise<any> {
    try {
      wallet = wallet || (await this.profileService.getWallets())[0];
      if (!wallet) throw 'no wallet';

      const address = wallet.getRootAddress();
      const acceptanceTx = await this.easyReceiveService.acceptEasyReceipt(receipt, wallet, data, address.toString());

      this.logger.info('accepted easy send', acceptanceTx);
      this.store.dispatch(new RefreshOneWalletAction(wallet.id, {
        skipShareCode: true,
        skipRewards: true,
        skipAlias: true
      }));

    } catch (err) {
      console.log(err);
      this.toastCtrl.error('There was an error retrieving your incoming payment.');
    }
  }

  private showSpentEasyReceiptAlert() {
    this.confirmDialogCtrl.create('Uh oh', 'It seems that the Merit from this link has already been redeemed!', [{ text: 'Ok' }]);
  }

  private showExpiredEasyReceiptAlert() {
    this.confirmDialogCtrl.create('Transaction expired', 'The Merit from this link has not been lost! You can ask the sender to make a new transaction.', [{ text: 'Ok' }]);
  }

  /**
   * gets easyReceipt data from the blockchain and routes the ui accordingly
   */
  async processEasyReceipt(receipt: EasyReceipt, password: string = '', processAll: boolean = true, wallet?: MeritWalletClient): Promise<void> {
    const data = await this.easyReceiveService.validateEasyReceiptOnBlockchain(receipt, password);
    let txs = data.txs;

    if (!txs) return await this.easyReceiveService.deletePendingReceipt(receipt);

    if (!Array.isArray(txs)) {
      txs = [txs];
    }

    if (!txs.length) return this.showPasswordEasyReceivePrompt(receipt, processAll);

    //Decide if the wallet is the sender of the Global Send.
    //We will prompt here to cancel the global send instead.
    const senderPublicKey = new PublicKey(receipt.senderPublicKey);
    const senderAddress = senderPublicKey.toAddress(ENV.network).toString();
    const wallets = await this.profileService.getWallets();

    if (!wallet) {
      wallet = wallets.find((wallet: MeritWalletClient) =>
        wallet.getRootAddress().toString() == senderAddress
      ) || wallets[0];
    }

    const address = wallet.getRootAddress().toString();
    const isSender = senderAddress == address;

    if (txs.some(tx => tx.spent)) {
      this.logger.debug('Got a spent GlobalSend. Removing from pending receipts.');
      await this.easyReceiveService.deletePendingReceipt(receipt);
      await this.showSpentEasyReceiptAlert();

      return processAll ? await this.processPendingEasyReceipts() : null;
    }

    if (txs.some(tx => (tx.confirmations === undefined))) {
      this.logger.warn('Got GlobalSend with unknown depth. It might be expired!');
      return isSender ?
        this.showCancelEasyReceivePrompt(receipt, data, wallet) :
        this.showConfirmEasyReceivePrompt(receipt, data, wallet);
    }

    if (txs.some(tx => receipt.blockTimeout < tx.confirmations)) {
      this.logger.debug('Got an expired GlobalSend. Removing from pending receipts.');
      await this.easyReceiveService.deletePendingReceipt(receipt);
      await this.showExpiredEasyReceiptAlert();
      return processAll ? await this.processPendingEasyReceipts() : null;
    }

    return isSender ?
      this.showCancelEasyReceivePrompt(receipt, data, wallet) :
      this.showConfirmEasyReceivePrompt(receipt, data, wallet);
  }

  /**
   * checks if pending easyreceive exists and if so, open it
   */
  private async processPendingEasyReceipts(): Promise<any> {
    const receipts = await this.easyReceiveService.getPendingReceipts();
    if (!receipts.length) return; // No receipts to process
    return this.processEasyReceipt(receipts[0]);
  }

  private async rejectEasyReceipt(receipt: EasyReceipt, data, wallet?: MeritWalletClient): Promise<any> {
    try {
      wallet = wallet || (await this.profileService.getWallets())[0];

      if (!wallet)
        throw 'Could not retrieve wallet';

      await this.easyReceiveService.rejectEasyReceipt(wallet, receipt, data);
      this.logger.info('GlobalSend rejected');
    } catch (err) {
      this.logger.error('Error rejecting GlobalSend', err);
      this.toastCtrl.error('There was an error rejecting the Merit');
    }
  }
}
