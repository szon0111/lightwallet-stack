import { Component, ViewChild } from '@angular/core';
import { IonicPage, NavController, NavParams, Tabs } from 'ionic-angular';
import { Logger } from 'merit/core/logger';
import { ProfileService } from 'merit/core/profile.service';

// Transact is the proposed name of the umbrella for the primary actions
// That exist through the tabs on the bottom of the screen.

@IonicPage({
  segment: 'transact'
})
@Component({
  selector: 'view-transact',
  templateUrl: 'transact.html',
})
export class TransactView {

  walletsView  = 'WalletsView';
  receiveView  = 'ReceiveView';
  networkView  = 'NetworkView';
  sendView     = 'SendView';
  settingsView = 'SettingsView';

  @ViewChild('tabs') tabRef: Tabs;

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    private logger: Logger,
    private profileService: ProfileService
  ) {
    this.logger.info("Hello TRANSACT VIEW!");
  }

  ionViewCanEnter() {
    const profile = this.profileService.profile;
    return (profile &&  profile.credentials && profile.credentials.length > 0);
  }


}
