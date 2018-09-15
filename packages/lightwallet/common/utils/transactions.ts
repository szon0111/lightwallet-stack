import { getEasySendURL } from '@merit/common/models/easy-send';
import { isEmpty, orderBy } from 'lodash';
import {
  IDisplayTransaction,
  ITransactionIO,
  IVisitedTransaction,
  TransactionAction,
} from '@merit/common/models/transaction';
import { ContactsService } from '@merit/common/services/contacts.service';
import { MeritWalletClient } from '@merit/common/merit-wallet-client';
import { FeeService } from '@merit/common/services/fee.service';
import { PersistenceService2 } from '@merit/common/services/persistence2.service';
import { IGlobalSendHistory, IGlobalSendHistoryItem } from '@merit/common/models/globalsend-history.model';

export async function formatWalletHistory(walletHistory: IDisplayTransaction[],
                                          wallet: MeritWalletClient,
                                          globalSendHistory: IGlobalSendHistory = [],
                                          feeService: FeeService,
                                          contactsProvider?: ContactsService,
                                          persistenceService?: PersistenceService2): Promise<IDisplayTransaction[]> {
  if (isEmpty(walletHistory)) return [];

  const easyReceiveFee = 20000;

  const globalSendsByAddress = {};

  globalSendHistory.forEach((globalSend: IGlobalSendHistoryItem) => {
    if (globalSend && globalSend.scriptAddress) {
      globalSendsByAddress[globalSend.scriptAddress] = globalSend;
    }
  });

  let meritMoneyAddresses = []; // registering merit money transactions so we can hide bound invite transactions

  let visitedTxs: IVisitedTransaction[];
  if (persistenceService) {
    visitedTxs = await persistenceService.getVisitedTransactions() || [];
  }

  walletHistory = orderBy(walletHistory, 'time', 'asc');

  let foundWalletUnlock = false;

  walletHistory = await Promise.all(walletHistory.map(async (tx: IDisplayTransaction, i: number) => {
    const received = tx.type === 'credit';

    const { alias: inputAlias, address: inputAddress } = tx.inputs ? tx.inputs[0] || <any>{} : <any>{};
    const { alias: outputAlias, address: outputAddress } = tx.outputs.find((output: ITransactionIO) => !!output.address && !output.isChange) || <any>{};

    const input = inputAlias ? '@' + inputAlias : 'Anonymous',
      output = outputAlias ? '@' + outputAlias : 'Anonymous';

    tx.name = tx.name || (received ? input : output);
    tx.image = 'merit';

    if (tx.isInvite && !foundWalletUnlock) {
      tx.isWalletUnlock = foundWalletUnlock = true;
      tx.name = 'Wallet unlock';
      tx.action = TransactionAction.UNLOCK;
    }

    tx.addressFrom = inputAlias ? '@' + inputAlias : inputAddress;
    tx.addressTo = outputAlias ? '@' + outputAlias : outputAddress;

    if (globalSendsByAddress[tx.addressTo]) {
      const globalSend = globalSendsByAddress[tx.addressTo];
      tx.name = tx.isInvite ? 'MeritInvite' : 'MeritMoney';
      tx.action = tx.isInvite ? TransactionAction.MERIT_INVITE : TransactionAction.MERIT_MONEY;
      tx.type = <any>tx.name.toLowerCase();

      if (tx.cancelled = globalSend.cancelled) {
        tx.cancelled = true;
      } else if (tx.claimed = globalSend.claimed) {
        tx.claimedBy = globalSend.claimedBy;
      } else {
        tx.easySend = JSON.parse(wallet.decryptGlobalSend(globalSend.globalSend));
        tx.easySendUrl = getEasySendURL(tx.easySend);
      }

      if (tx.type === 'meritmoney') {
        meritMoneyAddresses.push(tx.addressTo);
        tx.fees += easyReceiveFee;
        tx.amount -= easyReceiveFee;
      }
    }

    switch (tx.action) {
      case TransactionAction.AMBASSADOR_REWARD:
        tx.image = 'growth';
        tx.name = 'Growth Reward';
        break;

      case TransactionAction.INVITE:
        tx.image = 'invite';
        tx.name = tx.isCoinbase? 'Mined invite' : tx.name;
        break;

      case TransactionAction.MINING_REWARD:
        tx.image = tx.isInvite? 'invite' : 'mining';
        tx.name = tx.isInvite? 'Mined invite' : 'Mining reward';
        break;

      case TransactionAction.POOL_REWARD:
        tx.image = 'mining';
        tx.name = 'Pool reward';
        break;
    }

    tx.walletId = wallet.id;
    tx.isCredit = tx.type === 'credit';
    tx.isConfirmed = !tx.isCoinbase || tx.confirmations > 101;
    tx.isNew = false;

    if (persistenceService) {
      if (!visitedTxs.find(visTx => visTx.txid === tx.txid)) {
        tx.isNew = true;
        // add new one in visited
        visitedTxs.push({
          txid: tx.txid,
          counter: 1,
        });
      }
    }

    return tx;
  }));

  if (persistenceService) {
    //save to storage
    persistenceService.setVisitedTransactions(visitedTxs);
  }

  // remove meritmoney invites so we  have only one tx for meritmoney
  return walletHistory
    .filter(t => {

      if (meritMoneyAddresses.indexOf(t.addressFrom) !== -1) {
        //filtering out txs from cancelled MeritMoney/MeritInvite
        return false;
      }

      if (t.type == 'meritinvite') {
        if (meritMoneyAddresses.indexOf(t.addressTo) !== -1) {
          //filtering out invites txs that were part of MeritMoney
          return false;
        }
      }

      return true;
    })
    .reverse();
}
