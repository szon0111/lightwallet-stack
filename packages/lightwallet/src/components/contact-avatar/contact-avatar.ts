import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { getContactInitials } from '../../utils/contacts';
import { DomSanitizer } from '@angular/platform-browser';
import { MeritContact } from '../../models/merit-contact';

@Component({
  selector: 'contact-avatar',
  template: `
  <ion-avatar>
    <img *ngIf="imageSrc" [src]="imageSrc">
    <span *ngIf="contactInitials" color="primary">{{ contactInitials }}</span>
  </ion-avatar>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ContactAvatarComponent {

  @Input()
  set contact(contact: MeritContact) {
    if (contact.photos && contact.photos.length) {
      this.imageSrc = this._sanitizer.bypassSecurityTrustUrl(contact.photos[0].value);
    } else {
      this.contactInitials = getContactInitials(contact);
    }
  }

  imageSrc: any;
  contactInitials: string;

  constructor(private _sanitizer: DomSanitizer) {}
}