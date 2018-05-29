import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonPipesModule } from '@merit/common/common-pipes.module';
import { SharedComponentsModule } from '@merit/desktop/app/components/shared-components.module';
import { FileBackupView } from '@merit/desktop/app/core/backup/file-backup/file-backup.view';
import { CoreComponentsModule } from '@merit/desktop/app/core/components/core-components.module';
import { InviteRequestsView } from '@merit/desktop/app/core/invites/invite-requests/invite-requests.view';
import { InvitesHistoryView } from '@merit/desktop/app/core/invites/invites-history/invites-history.view';
import { InvitesView } from '@merit/desktop/app/core/invites/invites.view';
import { SendInviteView } from '@merit/desktop/app/core/invites/send-invite/send-invite.view';
import { WalletPasswordGuard } from '@merit/desktop/app/guards/wallet-password.guard';
import { QRCodeModule } from 'angular2-qrcode';
import { ClipModule } from 'ng2-clip';
import { Ng4LoadingSpinnerModule } from 'ng4-loading-spinner';
import { MomentModule } from 'ngx-moment';
import { BackupView } from './backup/backup.view';
import { MnemonicPhraseView } from './backup/mnemonic-phrase/mnemonic-phrase.view';
import { QrCodeBackupView } from './backup/qr-code-backup/qr-code-backup.view';
import { CommunityView } from './community/community.view';
import { MiningView } from './mining/mining.view';
import { InvitesComponent } from './community/invites/invites.component';
import { CoreRoutingModule } from './core-routing.module';
import { CoreView } from './core.component';
import { DashboardView } from './dashboard/dashboard.view';
import { WelcomeGuideComponent } from './dashboard/welcome-guide/welcome-guide.component';
import { GlobalSettingsView } from './global-settings/global-settings.view';
import { SettingsPreferencesView } from './global-settings/settings-preferences/settings-preferences.view';
import { SettingsSessionLogView } from './global-settings/settings-session-log/settings-session-log.view';
import { SettingsTermsOfUseView } from './global-settings/settings-terms-of-use/settings-terms-of-use.view';
import { HistoryView } from './history/history.view';
import { ReceiveView } from './receive/receive.view';
import { SendTourComponent } from './send/send-tour/send-tour.component';
import { SendView } from './send/send.view';
import { CreateWalletView } from './wallets/create-wallet/create-wallet.view';
import { WalletDetailHistoryView } from './wallets/wallet-details/wallet-details-history/wallet-details-history.view';
import { WalletDetailView } from './wallets/wallet-details/wallet-details.view';
import { WalletSettingsView } from './wallets/wallet-details/wallet-settings/wallet-settings.view';
import { WalletsView } from './wallets/wallets.view';

export function getPages() {
  return [
    WalletsView,
    HistoryView,
    ReceiveView,
    SendView,
    DashboardView,
    CreateWalletView,
    WalletDetailView,
    WalletSettingsView,
    CommunityView,
    MiningView,
    BackupView,
    MnemonicPhraseView,
    WalletDetailHistoryView,
    GlobalSettingsView,
    SettingsPreferencesView,
    SettingsTermsOfUseView,
    SettingsSessionLogView,
    QrCodeBackupView,
    FileBackupView,
    InvitesComponent,
    InvitesView,
    InvitesHistoryView,
    SendInviteView,
    InviteRequestsView,
    SendInviteView,
  ];
}

@NgModule({
  entryComponents: [
    CoreView,
    ...getPages()
  ],
  imports: [
    CommonModule,
    CoreRoutingModule,
    ReactiveFormsModule,
    QRCodeModule,
    CommonPipesModule,
    SharedComponentsModule,
    FormsModule,
    MomentModule,
    ClipModule,
    Ng4LoadingSpinnerModule,
    CoreComponentsModule
  ],
  declarations: [
    CoreView,
    ...getPages(),
    SendTourComponent,
    WelcomeGuideComponent
  ],
  providers: [
    WalletPasswordGuard
  ]
})
export class CoreModule {}
