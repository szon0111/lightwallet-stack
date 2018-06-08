import { Component, OnInit } from '@angular/core';
import { IRootAppState } from '@merit/common/reducers';
import { Store } from '@ngrx/store';

import { Observable } from 'rxjs/Observable';

import { Achievements, Achievement } from '@merit/common/models/achievement';
import { AchievementsService } from '@merit/common/services/achievements.service';

import { FormBuilder, FormGroup } from '@angular/forms';

import { DisplayWallet } from '@merit/common/models/display-wallet';
import { selectWallets, selectWalletsLoading, selectWalletTotals } from '@merit/common/reducers/wallets.reducer';

@Component({
  selector: 'app-wallet-setup-list',
  templateUrl: './wallet-setup-list.view.html',
  styleUrls: ['./wallet-setup-list.view.sass'],
})
export class WalletSetupListView implements OnInit {
  constructor(
    private store: Store<IRootAppState>,
    private AchievementsService: AchievementsService,
    private formBuilder: FormBuilder
  ) {}

  goalsState$: Observable<Achievements> = this.store.select('achievements');
  trackerSettings: any;

  formData: FormGroup = this.formBuilder.group({
    isSetupTrackerEnabled: false,
  });

  wallet;

  async ngOnInit() {
    await this.store.select('achievements').subscribe(res => {
      this.trackerSettings = res.settings;
      this.formData.patchValue({
        isSetupTrackerEnabled: res.settings.isSetupTrackerEnabled,
      });
    });
    await this.store.select(selectWallets).subscribe(res => {
      this.wallet = res[0];
    });
  }
  trackerStatus() {
    this.trackerSettings.isSetupTrackerEnabled = !this.trackerSettings.isSetupTrackerEnabled;
    this.trackerSettings.isWelcomeDialogEnabled = !this.trackerSettings.isWelcomeDialogEnabled;
    this.AchievementsService.setSettings(this.trackerSettings);
  }
  log(val) {
    console.log(val);
  }
}