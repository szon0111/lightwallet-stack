import { appReducer, IAppState } from '@merit/common/reducers/app.reducer';
import { walletsReducer, IWalletsState } from '@merit/common/reducers/wallets.reducer';
import { ITransactionsState, transactionsReducer } from '@merit/common/reducers/transactions.reducer';
import { INotificationsState, notificationsReducer } from '@merit/common/reducers/notifications.reducer';

export interface IRootAppState {
  app: IAppState;
  wallets: IWalletsState;
  transactions: ITransactionsState;
  notifications: INotificationsState;
}

export const reducer = {
  wallets: walletsReducer,
  app: appReducer,
  transactions: transactionsReducer,
  notifications: notificationsReducer
};

