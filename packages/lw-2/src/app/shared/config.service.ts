import { Injectable } from '@angular/core';
import { Logger } from 'merit/core/logger';
import { Events } from 'ionic-angular';
import { Promise } from 'bluebird';

import { PersistenceService } from 'merit/core/persistence.service';

import * as _ from "lodash";

/*
  Need to think about how to name this optimally, given.. 
  "AppService"
*/ 

interface Config {
  limits: {
    totalCopayers: number;
    mPlusN: number;
  };

  wallet: {
    requiredCopayers: number;
      totalCopayers: number;
      spendUnconfirmed: boolean;
      reconnectDelay: number;
      idleDurationMin: number;
      settings: {
        unitName: string;
        unitToMicro: number;
        unitDecimals: number;
        unitCode: string;
        alternativeName: string;
        alternativeIsoCode: string;
        defaultLanguage: string;
        feeLevel?: string;
      };
  };

  bws: {
    url: string;
  };

  download: {
    bitpay: {
      url: string;
    };
    copay: {
      url: string;
    }
  };

  rateApp: {
    lightwallet: {
      ios: string;
      android: string;
      wp: string;
    };
  };

  lock: {
    method: any;
    value: any;
    bannedUntil: any;
  };

  recentTransactions: {
    enabled: boolean;
  };

  hideNextSteps: {
    enabled: boolean;
  };

  rates: {
    url: string;
  };

  release: {
    url: string;
  };

  help: {
    url: string
  },

  pushNotificationsEnabled: boolean;

  confirmedTxsNotifications: {
    enabled: boolean;
  };

  emailNotifications: {
    enabled: boolean;
  };

  log: {
    filter: string;
  };

  // Custom Aliases 
  // Stored like: aliasFor[WalletId] = "Full Wallet"
  aliasFor?: object;
};

const configDefault: Config = {
  // wallet limits
  limits: {
    totalCopayers: 6,
    mPlusN: 100
  },

  // wallet default config
  wallet: {
    requiredCopayers: 2,
    totalCopayers: 3,
    spendUnconfirmed: false,
    reconnectDelay: 5000,
    idleDurationMin: 4,
    settings: {
      unitName: 'MRT',
      unitToMicro: 100000000,
      unitDecimals: 8,
      unitCode: 'mrt',
      alternativeName: 'US Dollar',
      alternativeIsoCode: 'USD',
      defaultLanguage: ''
    }
  },

  // Bitcore wallet service URL
  bws: {
    url: 'http://localhost:3232/bws/api'
  },

  download: {
    bitpay: {
      url: 'https://merit.me/wallet'
    },
    copay: {
      url: 'https://merit.me/#download'
    }
  },

  rateApp: {
    lightwallet: {
      ios: 'http://coming.soon',
      android: 'http://coming.soon',
      wp: ''
    }
  },

  lock: {
    method: null,
    value: null,
    bannedUntil: null
  },

  // External services
  recentTransactions: {
    enabled: true
  },

  hideNextSteps: {
    enabled: false
  },

  rates: {
    url: 'https://insight.merit.me:443/api/rates'
  },

  release: {
    url: 'https://api.github.com/repos/bitpay/copay/releases/latest'
  },

  help: {
    url: 'https://help.merit.me'
  },

  pushNotificationsEnabled: true,

  confirmedTxsNotifications: {
    enabled: true
  },

  emailNotifications: {
    enabled: false
  },

  log: {
    filter: 'debug'
  }
};

@Injectable()
export class ConfigService {
  private configCache: Config;


  constructor(
    private logger: Logger,
    private events: Events,
    private persistence: PersistenceService
  ) {
    this.load()
      .then(() => {
        this.logger.debug('ConfigService initialized.');
      }).catch(err => {
        this.logger.warn('ConfigService could not load default config');
      }) 
  }

  public load() {
    return new Promise((resolve, reject) => {
      this.persistence.getConfig().then((config: Config) => {
        if (!_.isEmpty(config)) this.configCache = _.clone(config);
        else this.configCache = _.clone(configDefault);
        resolve();
      }).catch((err) => {
        this.logger.error(err);
        reject();
      });
    });
  }

  public set(newOpts: object):Promise<any> {
    return new Promise((resolve, reject) => {
      let config = _.cloneDeep(configDefault);
      
          if (_.isString(newOpts)) {
            newOpts = JSON.parse(newOpts);
          }
          _.merge(config, this.configCache, newOpts);
          this.configCache = config;
          this.events.publish('config:updated', this.configCache);
      
          return this.persistence.storeConfig(this.configCache).then(() => {
            this.logger.info('Config saved');
            resolve(this.configCache);
          });
    });
  }

  public get(): Config {
    return this.configCache;
  }

  public getDefaults(): Config {
    return configDefault;
  }

}