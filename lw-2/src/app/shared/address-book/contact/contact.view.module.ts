import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { ContactView } from 'merit/shared/address-book/contact/contact.view';

// Contact Module
@NgModule({
  declarations: [
    ContactView,
  ],
  imports: [
    IonicPageModule.forChild(ContactView),
  ],
})
export class ContactViewModule {}
