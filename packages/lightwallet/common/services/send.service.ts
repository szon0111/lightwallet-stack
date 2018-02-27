import { Injectable } from '@angular/core';
import { MeritWalletClient } from '@merit/common/merit-wallet-client';
import { RateService } from '@merit/common/services/rate.service';
import { MWCService } from '@merit/common/services/mwc.service';
import { ConfigService } from '@merit/common/services/config.service';
import { PersistenceService } from '@merit/common/services/persistence.service';
import { LoggerService } from '@merit/common/services/logger.service';
import { isAlias } from '@merit/common/utils/addresses';
import { ISendMethod } from '@merit/common/models/send-method';

@Injectable()
export class SendService {
  private bitcore: any;
  private readonly ADDRESS_LENGTH = 34;
  private client: MeritWalletClient;

  constructor(private mwcService: MWCService,
              private rate: RateService,
              private config: ConfigService,
              private persistenceService: PersistenceService,
              private logger: LoggerService) {
    this.logger.info('Hello SendService');
    this.bitcore = this.mwcService.getBitcore();
    this.client = this.mwcService.getClient(null, {});
  }

  isAddress(addr: string): boolean {
    try {
      this.bitcore.Address.fromString(addr);
      return true;
    } catch (_e) {
      return false;
    }
  }

  couldBeAlias(alias: string): boolean {
    return this.bitcore.Referral.validateAlias(alias);
  }

  getAddressInfo(addr: string) {
    if (isAlias(addr)) addr = addr.slice(1);
    return this.client.validateAddress(addr);
  }

  async getAddressInfoIfValid(addr: string) {
    const info = await this.getAddressInfo(addr);
    return info.isValid && info.isBeaconed && info.isConfirmed ? info : null;
  }

  async isAddressValid(addr: string): Promise<boolean> {
    if (!this.isAddress(addr)) {
      return false;
    }

    const info = await this.getAddressInfo(addr);

    return info.isValid && info.isBeaconed && info.isConfirmed;
  }

  async isAddressBeaconed(addr: string): Promise<boolean> {
    if (!this.isAddress(addr)) {
      return false;
    }

    const info = await this.getAddressInfo(addr);

    return info.isValid && info.isBeaconed;

  }

  async getValidAddress(input: string): Promise<string> {
    if (!(this.isAddress(input) || this.couldBeAlias(input))) {
      return null;
    }

    const info = await this.getAddressInfo(input);

    if (info && info.isConfirmed) {
      return info.address;
    }

    return null;
  }

  getAddressNetwork(addr) {
    return this.bitcore.Address.fromString(addr).network;
  }

  async registerSend(method: ISendMethod) {
    return this.persistenceService.registerSend(method);
  }

  async getSendHistory() {
    let history = await this.persistenceService.getSendHistory();
    return history || [];
  }
}