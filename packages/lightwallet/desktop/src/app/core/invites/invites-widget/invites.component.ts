import { Component } from '@angular/core';
import { IRootAppState } from '@merit/common/reducers';
import { selectInviteRequests, selectInvites, selectWalletsWithInvites } from '@merit/common/reducers/wallets.reducer';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs/Observable';
import { DisplayWallet } from '@merit/common/models/display-wallet';

@Component({
  selector: 'app-invites-widget',
  templateUrl: './invites.component.html',
  styleUrls: ['./invites.component.sass'],
})
export class InvitesWidgetComponent {
  invites$: Observable<number> = this.store.select(selectInvites);
  inviteRequests$: Observable<any[]> = this.store.select(selectInviteRequests);
  availableInvites$: Observable<number> = this.store.select(selectInvites);
  wallets$: Observable<DisplayWallet[]> = this.store.select(selectWalletsWithInvites);

  constructor(private store: Store<IRootAppState>) {}
}
