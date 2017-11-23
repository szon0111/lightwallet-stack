import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';

import { CreateVaultMasterKeyView } from 'merit/vaults/create-vault/master-key/master-key';

import { ConfigService } from "merit/shared/config.service";
import { PopupService } from "merit/core/popup.service";
import { BwcService } from 'merit/core/bwc.service';

@NgModule({
  declarations: [
    CreateVaultMasterKeyView,
  ],
  providers: [
    ConfigService,
    PopupService,
    BwcService,
  ],
  imports: [
    IonicPageModule.forChild(CreateVaultMasterKeyView),
  ],
})
export class CreateVaultMasterKeyComponentModule {}
