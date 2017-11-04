import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { SendView } from 'merit/transact/send/send';
import { GravatarModule } from 'merit/shared/gravatar.module';
import { GravatarComponent } from 'merit/shared/gravatar.component';
import { WalletService } from "merit/wallets/wallet.service";
import { WalletsModule } from "merit/wallets/wallets.module";


// This module manaages the sending of money.
@NgModule({
  declarations: [
    SendView 
  ],
  imports: [
    IonicPageModule.forChild(SendView),
    GravatarModule, 
    WalletsModule
  ],
  providers: [
    WalletService
  ],
  exports: [
  ]
})
export class SendViewModule {}
