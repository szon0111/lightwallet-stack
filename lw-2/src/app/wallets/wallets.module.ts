import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { WalletsView } from 'merit/wallets/wallets';
import { VaultsView } from 'merit/vaults/vaults';
import { MomentModule } from 'angular2-moment';
import { BwcService } from 'merit/core/bwc.service';
import { TxFormatService } from 'merit/transact/tx-format.service';
import { WalletService } from 'merit/wallets/wallet.service';
import { MnemonicService } from 'merit/utilities/mnemonic/mnemonic.service';
import { LanguageService } from 'merit/core/language.service';

import {AppUpdateService} from "merit/core/app-update.service";
import {FeedbackService} from "../feedback/feedback.service";

import {EasyReceiveService} from "merit/easy-receive/easy-receive.service";

import { InAppBrowser } from '@ionic-native/in-app-browser';
import { AddressBookService } from "merit/shared/address-book/address-book.service";

@NgModule({
  declarations: [
    WalletsView,
    VaultsView,
  ],
  /** @DISCUSS what's the best place for app update service? */
  providers: [
    WalletService,
    AppUpdateService,
    FeedbackService,
    EasyReceiveService,
    AddressBookService,
    InAppBrowser,
    MnemonicService,
    LanguageService
  ],
  imports: [
    MomentModule,
    IonicPageModule.forChild(WalletsView)
  ],
})
export class WalletsModule {}
