/* global addthis_config */

import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { trigger, state, transition, style, animate } from '@angular/animations';
import { PersistenceService2 } from '@merit/common/services/persistence2.service';

declare var addthis_config: any;
declare var addthis_share: any;
@Component({
  selector: 'app-get-started-tips',
  templateUrl: './get-started-tips.component.html',
  styleUrls: ['./get-started-tips.component.sass'],
  animations: [
    trigger('showTips', [
      state('true', style({ maxHeight: '1000px', padding: '30px 20px' })),
      state('false', style({})),
      transition('* => *', animate('300ms ease-out')),
    ]),
  ],
})
export class GetStartedTipsComponent {
  constructor(private persistenceService: PersistenceService2) {}
  active: boolean = false;
  getArticle: boolean = false;
  syncWallet: boolean = false;
  copy: string = 'COPY';
  shareTitle: string = 'Merit - digital currency for humans.';
  shareUrl: string = 'wallet.merit.me';
  shareText: string = `Merit aims to be the world’s friendliest digital currency, making it dead simple to pay friends, buy goods, and manage your wealth.\n Get wallet now, your activation code: @`;

  @Input() wallets: Object;
  @Input() setTipType: string;

  async ngOnInit() {
    const getActiveState = await this.persistenceService.getViewSettings('showStarterTips');

    if (getActiveState !== false) {
      this.active = true;
    }

    // move created shareThis into right container
    var newParent = document.getElementById('pasteShareThis'),
      oldParent = document.getElementById('shareThis');

    while (oldParent.childNodes.length > 0) {
      newParent.appendChild(oldParent.childNodes[0]);
    }
  }
  ngOnDestroy() {
    // move created shareThis into right container
    var newParent = document.getElementById('shareThis'),
      oldParent = document.getElementById('pasteShareThis');

    while (oldParent.childNodes.length > 0) {
      newParent.appendChild(oldParent.childNodes[0]);
    }
  }
  ngOnChanges() {
    if (this.setTipType !== 'all' && this.active !== true) {
      this.active = true;
    }
    if (this.wallets[0]) {
      let alias = this.wallets[0].alias;
      addthis_config.ui_email_title = this.shareTitle;
      addthis_config.ui_email_note = this.shareText + alias;
      addthis_share = {
        passthrough: {
          twitter: {
            text: `${this.shareTitle}\n ${this.shareText}${alias}`,
          },
          linkedin: {
            title: this.shareTitle,
            text: `${this.shareTitle}\n ${this.shareText}${alias}`,
            description: `${this.shareTitle}\n ${this.shareText}${alias}`,
          },
          facebook: {
            title: this.shareTitle,
            text: `${this.shareTitle}\n ${this.shareText}${alias}`,
          },
        },
      };
    }
  }
  showHide(value) {
    if (this.active) {
      this.persistenceService.setViewSettings('showStarterTips', false);
      this.active = false;
    } else {
      this.active = true;
    }
  }
  getArticleAction() {
    if (this.getArticle) this.getArticle = false;
    else this.getArticle = true;
  }
  syncWalletAction() {
    if (this.syncWallet) this.syncWallet = false;
    else this.syncWallet = true;
  }
  copyState() {
    this.copy = 'COPIED';
  }
}
