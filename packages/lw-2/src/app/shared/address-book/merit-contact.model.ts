import * as _ from 'lodash';
let Bitcore = require('bitcore-lib');

import { Contact, IContactProperties, IContactName, IContactField } from '@ionic-native/contacts';
export interface AddressBook { [key:string]:MeritContact; }


export class MeritContact implements IContactProperties {

  public name: IContactName = {formatted: ''};
  public phoneNumbers: IContactField[] = [];
  public emails: IContactField[] = [];
  public photos: IContactField[] = [];
  public urls: Array<any> = [];
  public meritAddresses:Array<{network:string, address:string}> = [];
  public storeOnDevice:boolean = false;

  public nativeModel:Contact;

  isValid() {
    if (!this.name) return false;
    if (!this.meritAddresses.length) return false;
    let isValid = true;
    this.meritAddresses.forEach((address) => {
      if (!Bitcore.Address.isValid(address.address)) isValid = false;
    });
    return isValid;
  }

  public static fromDeviceContact(contact:Contact) {
    let self = new MeritContact();

    self.nativeModel = contact;
    self.storeOnDevice = true;
    self.name = contact.name || {};
    self.phoneNumbers =  contact.phoneNumbers || [];
    self.emails = contact.emails || [];
    self.photos = contact.photos || [];
    self.urls   = contact.urls || [];
    self.meritAddresses = _.chain(self.urls) 
      .filter((url) => url.value.indexOf('merit:') == 0)
      .map((url) => {
        return ({
          address: url.value.split(':')[1],
          network: url.value.split(':')[2]
        });
      }).value();
    return self;
  }

  public static fromAddressBookContact(contact:IContactProperties) {
    let self = new MeritContact();
    self.storeOnDevice = false;
    self.name = contact.name;
    self.phoneNumbers =  contact.phoneNumbers;
    self.emails = contact.emails;
    self.photos = contact.photos;
    self.urls   = contact.urls;
    return self;
  }

  hasNativeModel() {
    return (!!this.nativeModel);
  }

  getNativeModel():Contact {
    if (!this.hasNativeModel()) throw 'No native model';
    this.nativeModel.name = this.name;
    this.nativeModel.emails = this.emails;
    this.nativeModel.phoneNumbers = this.phoneNumbers;
    this.nativeModel.urls = this.urls;
    return this.nativeModel;
  }

}