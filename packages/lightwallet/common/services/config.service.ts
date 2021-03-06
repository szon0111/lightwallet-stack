import { Injectable } from '@angular/core';
import { Events } from 'ionic-angular/util/events';
import * as _ from 'lodash';
import { LoggerService } from '@merit/common/services/logger.service';
import { PersistenceService } from '@merit/common/services/persistence.service';

export interface IAppConfig {
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

  download: {
    bitpay: {
      url: string;
    };
    copay: {
      url: string;
    };
  };

  rateApp: {
    lightwallet: {
      ios: string;
      android: string;
      wp: string;
    };
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
    url: string;
  };

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
}

const configDefault: IAppConfig = {
  // wallet limits
  limits: {
    totalCopayers: 6,
    mPlusN: 100,
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
      feeLevel: 'normal',
    },
  },

  download: {
    bitpay: {
      url: 'https://merit.me/wallet',
    },
    copay: {
      url: 'https://merit.me/#download',
    },
  },

  rateApp: {
    lightwallet: {
      ios: 'http://coming.soon',
      android: 'http://coming.soon',
      wp: '',
    },
  },

  // External services
  recentTransactions: {
    enabled: true,
  },

  hideNextSteps: {
    enabled: false,
  },

  rates: {
    url: 'https://insight.merit.me:443/api/rates',
  },

  release: {
    url: 'https://api.github.com/repos/meritlabs/lightwallet-stack/releases/latest',
  },

  help: {
    url: 'https://help.merit.me',
  },

  pushNotificationsEnabled: true,

  confirmedTxsNotifications: {
    enabled: true,
  },

  emailNotifications: {
    enabled: false,
    emailAddress: '',
  },

  log: {
    filter: 'debug',
  },
};

@Injectable()
export class ConfigService {
  private configCache: IAppConfig = _.clone(configDefault);

  constructor(private logger: LoggerService, private persistence: PersistenceService) {
    this.load()
      .then(() => {
        this.logger.debug('ConfigService initialized.');
      })
      .catch(err => {
        this.logger.warn('ConfigService could not load default config');
      });
  }

  async load(): Promise<IAppConfig> {
    try {
      const config: any = await this.persistence.getConfig();
      this.configCache = _.clone(_.isEmpty(config) ? configDefault : config);
    } catch (err) {
      this.logger.error(err);
      throw err;
    }
    return null;
  }

  async set(newOpts: object) {
    let config = _.cloneDeep(configDefault);

    if (_.isString(newOpts)) {
      newOpts = JSON.parse(newOpts);
    }
    _.merge(config, this.configCache, newOpts);
    this.configCache = config;

    await this.persistence.storeConfig(this.configCache);

    this.logger.info('Config saved');
    return this.configCache;
  }

  get(): IAppConfig {
    return this.configCache;
  }

  getDefaults(): IAppConfig {
    return configDefault;
  }
}
