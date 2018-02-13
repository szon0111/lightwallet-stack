import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { CreateVaultDepositView } from 'merit/vaults/create-vault/deposit/deposit';

@NgModule({
  declarations: [
    CreateVaultDepositView,
  ],
  imports: [
    IonicPageModule.forChild(CreateVaultDepositView),
  ],
})
export class CreateVaultDepositComponentModule {
}