import { AddressService } from '@merit/common/services/address.service';
import { Component, ViewEncapsulation} from '@angular/core';
import { DisplayWallet } from '@merit/common/models/display-wallet';
import { ElectronService } from '@merit/desktop/services/electron.service';
import { Observable } from 'rxjs/Observable';
import { PersistenceService2 } from '@merit/common/services/persistence2.service';
import { Store } from '@ngrx/store';
import { Subscription } from 'rxjs/Subscription';
import { WalletService } from '@merit/common/services/wallet.service';

import {
  selectWallets, selectWalletsLoading,
} from '@merit/common/reducers/wallets.reducer';

import { IRootAppState } from '@merit/common/reducers';
import { filter, take } from 'rxjs/operators';

@Component({
  selector: 'view-mining',
  templateUrl: './mining.view.html',
  styleUrls: ['./mining.view.sass'],
  encapsulation: ViewEncapsulation.None
})

export class MiningView {
  wallets$: Observable<DisplayWallet[]> = this.store.select(selectWallets);
  walletsLoading$: Observable<boolean> = this.store.select(selectWalletsLoading);
  selectedWallet: DisplayWallet;

  address: string;
  alias: string;
  workers: number = 1;
  threadsPerWorker: number = 1;
  miningLabel: string;
  updateTimer: any; 
  statTimer: any; 
  minCores: number = 1;
  maxCores: number;
  cores: number;
  miningSettings: any;
  pools: any[];
  selectedPool: any;
  mining: boolean = false;
  stats: any;
  error: string;

  constructor(
    private store: Store<IRootAppState>,
    private walletService: WalletService,
    private persistenceService: PersistenceService2,
    private addressService: AddressService) {

    this.maxCores = ElectronService.numberOfCores();
    this.updateLabel();
  }


  async ngOnInit() {
    try {
      const wallets = await this.wallets$.pipe(
            filter(w => w.length > 0), take(1)).toPromise();

      this.selectWallet(wallets[0]);
      this.miningSettings = await this.persistenceService.getMinerSettings();
      if(this.miningSettings.cores) {
        this.cores = this.miningSettings.cores; 
      } else {
        this.cores = Math.max(this.minCores, this.maxCores / 2); 
      }

      if(this.miningSettings.pools) {
        this.pools = this.miningSettings.pools;
        this.selectedPool = this.miningSettings.selectedPool;
      } else { 
        this.pools = [
          {
            name: 'Merit Pool',
            url: 'stratum+tcp://pool.merit.me:3333'
          },
          {
            name: 'Parachute Pool',
            url: 'stratum+tcp://parachute.merit.me:3333'
          },
          /*
           * TODO : Add support for custom pools
          {
            name: 'Custom',
            url: ''
          },
           */
        ];
        this.selectedPool = this.pools[0];
        this.updateStats();
        ElectronService.setAgent();

      }
    } catch (err) {
      if (err.text)
        console.log('Could not initialize: ', err.text);
    }
  }

  async selectWallet(wallet: DisplayWallet) {
    if (!wallet) return;

    this.selectedWallet = wallet;
    this.address = this.selectedWallet.client.getRootAddress().toString();
    let info = await this.addressService.getAddressInfo(this.address);
    this.alias = info.alias;
  }

  selectPool(pool: any) {
    if(!pool) return;
    this.error = null;
    this.selectedPool = pool;
  }

  isMining() {
    return ElectronService.isMining();
  }

  isStopping() {
    return ElectronService.isStopping();
  }

  mineButtonLabel()
  {
    if(this.isMining()) {
      if(this.isStopping()) {
        return 'Stopping';
      } else { 
        return 'Stop';
      }
    } 
    return 'Start';
  }

  updateLabel()
  {
    this.miningLabel = this.mineButtonLabel();
    if(this.isStopping()) {
        this.updateTimer = setTimeout(this.updateLabel.bind(this), 250);
    }
  }

  computeUtilization() {
    if(this.cores % 2 == 0) {
      this.workers = this.cores / 2;
      this.threadsPerWorker = 2;
    } else {
      this.workers = this.cores;
      this.threadsPerWorker = 1;
    }
  }

  setCores(e: any) {
    this.cores = parseInt(e.target.value);
  }

  saveSettings() {
    this.miningSettings.cores = this.cores;
    this.miningSettings.pools = this.pools;
    this.miningSettings.selectedPool = this.selectedPool;
    this.persistenceService.setMiningSettings(this.miningSettings);
  }

  stopMining() {
    this.error = null;
    if(!this.isStopping()) {
      console.log("stats", this.stats);
      ElectronService.stopMining();
      this.updateTimer = setTimeout(this.updateLabel.bind(this), 250);
      this.statTimer = setTimeout(this.updateStats.bind(this), 1000);
    }
  }

  isConnected() {
    return ElectronService.isConnectedToPool();
  }

  startMining() {
    this.error = null;
    this.computeUtilization();

    try
    {
      ElectronService.startMining(this.selectedPool.url, this.address, this.workers, this.threadsPerWorker);
      this.updateTimer = setTimeout(this.updateLabel.bind(this), 250);
      this.statTimer = setTimeout(this.updateStats.bind(this), 1000);
    } catch (e) {
      this.error = "Error Connecting to the Selected Pool";
    }
  }

  updateStats() {
    this.mining = this.isMining();
    this.stats = ElectronService.getMiningStats();

    if(this.mining) {
      if(this.isConnected()) {
        this.error = null;
      } else if(!this.isStopping()) {
        this.error = "Disconnected from Pool, Reconnecting...";
      }
      this.statTimer = setTimeout(this.updateStats.bind(this), 1000);
    }
  }

  toggleMining() {
    this.saveSettings();

    if(this.isMining()) { 
      this.stopMining();
    } else {
      this.startMining();
    }
  }

}