import { Injectable } from '@angular/core';
import { Events } from 'ionic-angular';

import * as _ from 'lodash';
import { Logger } from 'merit/core/logger';


import { PersistenceService } from 'merit/core/persistence.service';

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
    reconnectDelay: number;
    spendUnconfirmed: boolean;
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
    emailAddress: string;
  };

  log: {
    filter: string;
  };

  // Custom Aliases
  // Stored like: aliasFor[WalletId] = "Full Wallet"
  aliasFor?: object;

  network: {
    name: string;
  }
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
    spendUnconfirmed: true,
    reconnectDelay: 5000,
    idleDurationMin: 4,
    settings: {
      unitName: 'MRT',
      unitToMicro: 100000000,
      unitDecimals: 8,
      unitCode: 'mrt',
      alternativeName: 'US Dollar',
      alternativeIsoCode: 'USD',
      defaultLanguage: '',
      feeLevel: 'normal'
    }
  },

  // Bitcore wallet service URL
  bws: {
    // url: 'https://mws.merit.me/bws/api'
    url: 'http://159.203.29.124:3232/bws/api'
    // url: 'https://stage.mws.merit.me'
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
    url: 'https://api.github.com/repos/meritlabs/lightwallet-stack/releases/latest'
  },

  help: {
    url: 'https://help.merit.me'
  },

  pushNotificationsEnabled: true,

  confirmedTxsNotifications: {
    enabled: true
  },

  emailNotifications: {
    enabled: false,
    emailAddress: ''
  },

  log: {
    filter: 'debug'
  },

  network: {
    name: 'testnet'
  }
};

@Injectable()
export class ConfigService {
  private configCache: Config;

  constructor(private logger: Logger,
              private events: Events,
              private persistence: PersistenceService) {
    this.load()
      .then(() => {
        this.logger.debug('ConfigService initialized.');
      }).catch(err => {
      this.logger.warn('ConfigService could not load default config');
    })
  }

  async load() {
    try {
      const config: any = await this.persistence.getConfig();
      if (!_.isEmpty(config)) this.configCache = _.clone(config);
      else this.configCache = _.clone(configDefault);
    } catch (err) {
      this.logger.error(err);
      throw err;
    }
  }

  async set(newOpts: object): Promise<any> {
    let config = _.cloneDeep(configDefault);

    if (_.isString(newOpts)) {
      newOpts = JSON.parse(newOpts);
    }
    _.merge(config, this.configCache, newOpts);
    this.configCache = config;
    this.events.publish('config:updated', this.configCache);

    await this.persistence.storeConfig(this.configCache);

    this.logger.info('Config saved');
    return this.configCache;
  }

  public get(): Config {
    return this.configCache;
  }

  public getDefaults(): Config {
    return configDefault;
  }

}