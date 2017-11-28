import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams, ModalController } from 'ionic-angular';
import * as Promise from 'bluebird';

import { WalletService } from 'merit/wallets/wallet.service';
import { ProfileService } from 'merit/core/profile.service';
import { AddressBookService } from 'merit/shared/address-book/address-book.service';
import { PopupService } from 'merit/core/popup.service';
import { SendService } from 'merit/transact/send/send.service';
import { Logger } from 'merit/core/logger';

import * as _ from 'lodash';
import { MeritWalletClient } from '../../../lib/merit-wallet-client/index';
import { AddressBook, MeritContact, emptyMeritContact, Searchable } from 'merit/shared/address-book/contact/contact.model';

/**
 * The Send View allows a user to frictionlessly send Merit to contacts
 * without needing to know if they are on the Merit network.
 * We differentiate between the notions of 'original contacts,' which are explicitly created by the user as well as deviceContacts that are already in the addressBook of the device they are using. 
 */
@IonicPage()
@Component({
  selector: 'send-view',
  templateUrl: 'send.html',
})
export class SendView {
  public static readonly CONTACTS_SHOW_LIMIT = 10;
  private walletsToTransfer: Array<any>; // Eventually array of wallets
  private showTransferCard: boolean;
  private wallets: Array<MeritWalletClient>;
  private originalContacts: Array<MeritContact>;
  private deviceContacts: Array<any>; // On your phone or mobile device.
  private currentContactsPage = 0;
  private showMoreContacts: boolean = false;
  private filteredList: Array<MeritContact>; 
  private formData: { 
    search: string
  };
  private searchFocus: boolean;
  private hasFunds: boolean;
  private hasOwnedMerit: boolean; 
  private network: string;

  
  public hasContacts:boolean; 

  constructor(
    private navCtrl: NavController,
    private navParams: NavParams,
    private walletService: WalletService,
    private popupService: PopupService,
    private profileService: ProfileService,
    private logger: Logger,
    private sendService: SendService,
    private addressBookService:AddressBookService,
    private modalCtrl:ModalController
  ) {
    console.log("Hello SendView!!");
    this.hasOwnedMerit = this.profileService.hasOwnedMerit();
    this.formData = { search: '' };
  }

  async ionViewDidLoad() {
    await this.updateHasFunds().then(() => {
      this.originalContacts = [];
      this.initList();
      this.initContactList();
      return this.initDeviceContacts();
    }).catch((err) => {
      return this.popupService.ionicAlert('SendView Error:', err.toString());
    });
  }

  private hasWallets(): boolean {
    return (_.isEmpty(this.wallets) ? false : true);
  }
  
  private updateHasFunds(): Promise<void> {
    return this.profileService.hasFunds().then((hasFunds) => {
      this.hasFunds = hasFunds;
      return Promise.resolve();
    });
  }

  private updateWalletList(): Promise<any> {
    let walletList:Array<any> = [];
    return new Promise((resolve, reject) => {
      _.each(this.wallets, (w) => {
        walletList.push({
          color: w.color,
          name: w.name, 
          recipientType: 'wallet',
          getAddress: () => {
            Promise.resolve(this.walletService.getAddress(w, false));
          }
        });
      });
      return resolve(walletList);
    });
  }

  private addressBookToContactList(ab: AddressBook): Promise<any[]> {
    return new Promise((resolve, reject) => {
      let cl = _.map(ab, (v:any, k) => {
        let item:any = {
          name: _.isObject(v) ? v.name : v,
          meritAddress: k,
          email: _.isObject(v) ? v.email : null,
          phoneNumber: _.isObject(v) ? v.phoneNumber : null,
          sendMethod: 'address',
        };
        item.searchTerm = item.name + item.email + item.phoneNumber;
        return item;
      });
      resolve(cl);
    });
  };

  private initContactList(): Promise<void> {
    return this.addressBookService.list(this.network).then((ab) => {
      this.hasContacts = !_.isEmpty(ab);

      return this.addressBookToContactList(ab).then((completeContacts) => {
        this.originalContacts = this.originalContacts.concat(completeContacts);
        this.showMoreContacts = completeContacts.length > SendView.CONTACTS_SHOW_LIMIT;
      });
    });
  }

  private initDeviceContacts(): Promise<any> {

    return this.addressBookService.getAllDeviceContacts().then((contacts) => {
      contacts = _.filter(contacts, (contact) => {
        return !(_.isEmpty(contact.emails) && _.isEmpty(contact.phoneNumbers));
      });
      this.deviceContacts = _.map(contacts, (contact) => {
        var item:any = {
          name: contact.name.formatted,
          emails: _.map(contact.emails, (email)  => email.value),
          phoneNumbers: _.map(contact.phoneNumbers, (phoneNumber) => phoneNumber.value),
          address: '',
        };
        item.searchTerm = item.name + _.sum(item.emails.concat(item.phoneNumbers));
        return item;
      });
 
    });
  } 
  
  private initList():void {
    this.filteredList = [];
    
    // TODO: Resize this in the best-practices ionic3 wya.  
    //this.content.resize();  
    //TODO: Lifecycle tick if needed
  }

  private findMatchingContacts<T extends Searchable>(list: T[], term: string): T[] {
    return _.filter(list, (item) => {
      return _.includes(item.searchTerm.toLowerCase(), term.toLowerCase());
    });
  }

  private contactWithSendMethod(contact, search: string): MeritContact {
    let obj = _.clone(contact);

    let email = _.find(obj.emails, (x: string) => {
      return _.includes(x.toLowerCase(), search.toLowerCase());
    });
    if (email) {
      obj.email = email;
      obj.phoneNumber = _.find(obj.phoneNumbers) || '';
      obj.sendMethod = 'email';
      return obj;
    }

    let phoneNumber = _.find(obj.phoneNumbers, (x: string) => {
      return _.includes(x.toLowerCase(), search.toLowerCase());
    });
    if (phoneNumber) {
      obj.phoneNumber = phoneNumber;
      obj.email = _.find(obj.emails) || '';
      obj.sendMethod = 'sms';
      return obj;
    }

    // search matched name, default to sms?
    obj.email = _.find(obj.emails) || '';
    obj.phoneNumber = _.find(obj.phoneNumbers) || '';
    obj.sendMethod = obj.phoneNumber ? 'sms' : 'email';
    return obj;
  }

  private emptyContact = emptyMeritContact();

  private justMeritAddress(meritAddress: string): MeritContact {
    return _.defaults({meritAddress: meritAddress, sendMethod: 'address'}, this.emptyContact);
  }

  private justPhoneNumber(phoneNumber: string): MeritContact {
    return _.defaults({phoneNumber: phoneNumber, sendMethod: 'sms'}, this.emptyContact);
  }

  private justEmail(email: string): MeritContact {
    return _.defaults({email: email, sendMethod: 'email'}, this.emptyContact);
  }

  private openScanner(): void {
    let modal = this.modalCtrl.create('ImportScanView');
    modal.onDidDismiss((code) => {
        this.findContact(code); 
    });
    modal.present();
  }
 
  private showMore(): void {
    this.currentContactsPage++;
    this.updateWalletList();
  }

  private searchInFocus(): void {
    this.searchFocus = true;
  }

  private searchBlurred(): void {
    if (this.formData.search == null || this.formData.search.length == 0) {
      this.searchFocus = false;
    }
  }

  private findContact(search: string): any {

    // TODO: Improve to be more resilient.
    if(search && search.length > 19) {
      this.sendService.isAddressValid(search).then((isValid) => {
          if (isValid) {
            this.profileService.getWallets()
              .then((wallets) => {
                this.navCtrl.push('SendAmountView', {
                  wallet: wallets[0],
                  sending: true,
                  recipient: this.justMeritAddress(search)
                });
              });
        } else {
          this.popupService.ionicAlert('This address has not been invited to the merit network yet!');
        }  
      })
    }

    this.logger.debug("Inside FindContact");
    if (!search || search.length < 1) {
      this.filteredList = [];
      return;
    }

    var result = this.findMatchingContacts(this.originalContacts, search);
    var deviceResult = this.findMatchingContacts(this.deviceContacts, search);
    this.filteredList = result.concat(_.map(deviceResult, (contact) => {
      return this.contactWithSendMethod(contact, search);
    }));  
  }

  private goToAmount(item) {
    return this.profileService.getWallets().then((wallets) => {
      return this.navCtrl.push('SendAmountView', {
        wallet: wallets[0],
        sending: true,
        recipient: item
      });
    });
  }

  // TODO: Let's consider a better way to handle these multi-hop transitions.
  private createWallet():void {
    this.navCtrl.push('wallets').then(() => {
      this.navCtrl.push('add-wallet');
    });
  }

  private buyMert(): void {
    this.navCtrl.push('wallets').then(() => {
      this.navCtrl.push('buy-and-sell');
    });
  }

}
