import { Component } from '@angular/core';
import { IonicPage, ModalController, NavController, NavParams } from 'ionic-angular';
import { SendService } from 'merit/transact/send/send.service';
import { SendMethodDestination } from 'merit/transact/send/send-method.model';
import { AddressScannerService } from 'merit/utilities/import/address-scanner.service';
import * as _ from 'lodash';
import { ContactsProvider } from 'merit/../providers/contacts/contacts';
import { MeritContact } from 'merit/../models/merit-contact';
import { WalletService } from 'merit/wallets/wallet.service';
import { ToastConfig } from 'merit/core/toast.config';
import { MeritToastController } from 'merit/core/toast.controller';

import { ENV } from '@app/env';
import { cleanAddress, isAlias } from '../../../../utils/addresses';

const ERROR_ADDRESS_NOT_FOUND = 'ADDRESS_NOT_FOUND';
const ERROR_ALIAS_NOT_FOUND = 'ALIAS_NOT_FOUND';

@IonicPage()
@Component({
  selector: 'view-send-invite',
  templateUrl: 'send-invite.html'
})
export class SendInviteView {
  public searchQuery: string = '';
  public loadingContacts: boolean = false;
  public contacts: Array<MeritContact> = [];
  public amount: number;
  public availableInvites;
  public searchResult: {
    withMerit: Array<MeritContact>,
    toNewEntity:{destination:string, contact:MeritContact},
    error:string
  } = {withMerit: [], toNewEntity: null, error: null};

  private wallets:Array<any>;

  constructor(
      private navCtrl: NavController,
      private navParams: NavParams,
      private contactsService: ContactsProvider,
      private sendService: SendService,
      private modalCtrl: ModalController,
      private addressScanner: AddressScannerService,
      private walletService: WalletService,
      private toastCtrl: MeritToastController
  ) {  }

  async ionViewWillEnter() {
    this.wallets = this.navParams.get('wallets');
    this.loadingContacts = true;
    this.contacts = await this.contactsService.getAllMeritContacts();
    this.loadingContacts = false;
    this.parseSearch();
    if (this.wallets) {
      this.availableInvites = this.wallets.reduce((invites, wallet) => invites + wallet.invites, 0);
    }
  }

  async parseSearch() {
    let result = { withMerit: [], toNewEntity: null, error: null };

    if (!this.searchQuery || !this.searchQuery.length) {
      this.clearSearch();
      this.debounceSearch.cancel();
      result.withMerit = this.contacts.filter(c => !_.isEmpty(c.meritAddresses));
      return this.searchResult = { withMerit: [], toNewEntity: null, error: null };
    }

    if (this.searchQuery.length > 6 && this.searchQuery.indexOf('merit:') == 0)
      this.searchQuery = this.searchQuery.split('merit:')[1];

    this.debounceSearch();
  }

  private debounceSearch = _.debounce(() => this.search(), 300);

  private async search() {

    let result = { withMerit: [], toNewEntity: null, error: null };

    const input = cleanAddress(this.searchQuery.split('?')[0]);
    this.amount = parseInt(this.searchQuery.split('?micros=')[1]);

    let query = isAlias(input) ? input.slice(1) : input;
    this.contactsService.searchContacts(this.contacts, query)
      .forEach((contact: MeritContact) => {
        if (!_.isEmpty(contact.meritAddresses)) {
          result.withMerit.push(contact);
        }
      });


    if (_.isEmpty(result.withMerit)) {
      if (this.isAddress(input)) {
        let isBeaconed = await this.sendService.isAddressBeaconed(input);

        if (isBeaconed) {
          result.toNewEntity = { destination: SendMethodDestination.Address, contact: new MeritContact() };
          result.toNewEntity.contact.meritAddresses.push({ address: input, network: ENV.network});
        } else {
          result.error = ERROR_ADDRESS_NOT_FOUND;
        }
      } else if (this.couldBeAlias(input)) {
        const alias = input.slice(1);
        const addressInfo = await this.sendService.getAddressInfo(alias);

        if (addressInfo && addressInfo.isConfirmed) {
          result.toNewEntity = { destination: SendMethodDestination.Address, contact: new MeritContact() };
          result.toNewEntity.contact.meritAddresses.push({ alias, address: addressInfo.address, network: ENV.network});
        } else {
          result.error = ERROR_ALIAS_NOT_FOUND;
        }
      }
    }

    this.searchResult = result;
  }

  private couldBeAlias(input) {
    if (!isAlias(input)) return false;
    return this.sendService.couldBeAlias(input.slice(1));
  }

  private isAddress(input) {
    return this.sendService.isAddress(input);
  }

  clearSearch() {
    this.searchQuery = '';
    if (this.searchResult) {
      delete this.searchResult.toNewEntity;
    }
  }

  createContact() {
    const address = this.searchResult.toNewEntity.contact.meritAddresses[0];
    const modal = this.modalCtrl.create('SendCreateContactView', { address });
    modal.onDidDismiss((contact) => {
      if (contact) {
        return this.sendInvite(this.searchResult.toNewEntity.contact);
      }
    });
    modal.present();
  }

  bindAddressToContact() {
    const address = this.searchResult.toNewEntity.contact.meritAddresses[0];
    const modal = this.modalCtrl.create('SendSelectBindContactView', { contacts: this.contacts, address });
    modal.onDidDismiss((contact) => {
      if (contact) {
        return this.sendInvite(this.searchResult.toNewEntity.contact);
      }
    });
    modal.present();
  }

  async openScanner() {
    this.searchQuery = await this.addressScanner.scanAddress();
    this.parseSearch();
  }

  public async sendInvite(contact) {

    const toAddress = contact.meritAddresses[0].address;

    let wallet = null;
    this.wallets.some(w => {
      if (w.invites) {
        return wallet = w;
      }
    });
    if (!wallet) {
      return this.toastCtrl.create({
        message: 'You have no active invites',
        cssClass: ToastConfig.CLASS_ERROR
      }).present();
    }

    try {
      await this.walletService.sendInvite(wallet.client, toAddress);
      return this.navCtrl.pop();
    } catch (e) {
      console.log(e);
      this.toastCtrl.create({
        message: 'Failed to send invite',
        cssClass: ToastConfig.CLASS_ERROR
      }).present();
    }

  }
}
