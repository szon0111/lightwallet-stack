import { Component } from '@angular/core';
import { Platform, ModalController} from 'ionic-angular';
import { StatusBar } from '@ionic-native/status-bar';
import { SplashScreen } from '@ionic-native/splash-screen';

import { Logger } from 'merit/core/logger';
import { ProfileService } from 'merit/core/profile.service';
import { AppService } from 'merit/core/app-settings.service'; 
import { ConfigService } from 'merit/shared/config.service';

import { TransactView } from 'merit/transact/transact';
import { OnboardingView } from 'merit/onboard/onboarding.view';
import { FingerprintLockView } from 'merit/utilities/fingerprint-lock/fingerprint-lock';
import { PinLockView } from 'merit/utilities/pin-lock/pin-lock';
import { Promise } from 'bluebird'; 


@Component({
  templateUrl: 'app.html'
})
export class MeritLightWallet {

  public rootComponent;

  constructor(
    private platform: Platform, 
    private statusBar: StatusBar, 
    private splashScreen: SplashScreen,
    private profileService: ProfileService,
    private logger: Logger,
    private modalCtrl: ModalController,
    private appService: AppService,
    private configService: ConfigService
  ) {

    this.initializeApp();
  }

  /*
     Upon loading the app (first time or later), we must
     load and bind the persisted profile (if it exists).
  */ 
  private initializeApp() {
    
    this.platform.ready().then((readySource) => {
      this.appService.getInfo().then((appInfo) => {
        this.logger.info(
          'platform ready (' + readySource + '): ' +
          appInfo.nameCase +
          ' - v' + appInfo.version +
          ' #' + appInfo.commitHash);
  
        if (this.platform.is('cordova')) {
          this.statusBar.styleLightContent();
          this.splashScreen.hide();
        }
        Promise.longStackTraces();
        process.on('unhandledRejection', console.log.bind(console));
        Promise.onPossiblyUnhandledRejection((error) => {
          throw error;
      });      
        // Check Profile
        this.profileService.loadAndBindProfile().then((profile: any) => {
          
          this.openLockModal();
          if (profile) {
            this.rootComponent = 'TransactView';
          } else {
            //this.profileService.createProfile();
            this.rootComponent = 'OnboardingView';
          }
        }).catch((err: any) => {
          this.logger.warn(err);
          //TODO: Send them somewhere better.
          this.rootComponent = 'OnboardingView';
        });
      });
    });
  }


  private openLockModal() {
    let config: any = this.configService.get();
    let lockMethod = config.lock.method;
    if (!lockMethod) return;
    if (lockMethod == 'PIN') this.openPINModal('checkPin');
    if (lockMethod == 'Fingerprint') this.openFingerprintModal();
  }

  private openPINModal(action) {
    let modal = this.modalCtrl.create(PinLockView, { action }, { showBackdrop: false, enableBackdropDismiss: false });
    modal.present();
  }

  private openFingerprintModal() {
    let modal = this.modalCtrl.create(FingerprintLockView, {}, { showBackdrop: false, enableBackdropDismiss: false });
    modal.present();
  }

}
