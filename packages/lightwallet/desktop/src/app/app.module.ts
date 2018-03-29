import { HttpClient, HttpClientModule } from '@angular/common/http';
import { APP_INITIALIZER, NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { IonicStorageModule } from '@ionic/storage';
import { CommonPipesModule } from '@merit/common/common-pipes.module';
import { CommonProvidersModule } from '@merit/common/common-providers.module';
import { AppEffects } from '@merit/common/effects/app.effects';
import { TransactionEffects } from '@merit/common/effects/transaction.effects';
import { WalletEffects } from '@merit/common/effects/wallet.effects';
import { DisplayWallet } from '@merit/common/models/display-wallet';
import { IRootAppState, reducer } from '@merit/common/reducers';
import { UpdateAppAction } from '@merit/common/reducers/app.reducer';
import { RefreshWalletsAction, selectWallets } from '@merit/common/reducers/wallets.reducer';
import { AppSettingsService } from '@merit/common/services/app-settings.service';
import { ProfileService } from '@merit/common/services/profile.service';
import { DOMController } from '@merit/desktop/app/components/dom.controller';
import { SharedComponentsModule } from '@merit/desktop/app/components/shared-components.module';
import { DashboardGuard } from '@merit/desktop/app/guards/dashboard.guard';
import { OnboardingGuard } from '@merit/desktop/app/guards/onboarding.guard';
import { EffectsModule } from '@ngrx/effects';
import { Store, StoreModule } from '@ngrx/store';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { Platform } from 'ionic-angular/platform/platform';
import { Events } from 'ionic-angular/util/events';
import 'rxjs/add/operator/toPromise';
import { filter, take } from 'rxjs/operators';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

export function createTranslateLoader(http: HttpClient) {
  return new TranslateHttpLoader(http, 'assets/i18n');
}

export function loadConfigs(appService: AppSettingsService, profileService: ProfileService, store: Store<IRootAppState>) {
  return async () => {
    await appService.getInfo();

    store.dispatch(new UpdateAppAction({
      loading: false,
      credentialsLength: profileService.wallets.length
    }));

    if (await profileService.isAuthorized()) {
      store.dispatch(new RefreshWalletsAction());

      await store.select(selectWallets)
        .pipe(
          filter((wallets: DisplayWallet[]) => wallets.length === profileService.wallets.length),
          take(1)
        )
        .toPromise();
    }
  };
}

export function getProviders() {
  return [
    Events,
    Platform,
    DOMController,
    DashboardGuard,
    OnboardingGuard
  ];
}

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    IonicStorageModule.forRoot(),
    HttpClientModule,
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: createTranslateLoader,
        deps: [HttpClient]
      }
    }),
    CommonProvidersModule.forRoot(),
    CommonPipesModule,
    StoreModule.forRoot(reducer),
    ReactiveFormsModule,
    EffectsModule.forRoot([
      AppEffects,
      WalletEffects,
      TransactionEffects
    ]),
    SharedComponentsModule.forRoot()
  ],
  providers: [
    ...getProviders(),
    {
      provide: APP_INITIALIZER,
      useFactory: loadConfigs,
      deps: [AppSettingsService, ProfileService, Store],
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule {
}
