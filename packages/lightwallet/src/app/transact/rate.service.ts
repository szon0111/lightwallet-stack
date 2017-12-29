import { Injectable } from '@angular/core';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/toPromise';
import 'rxjs/add/operator/timeout';
import 'rxjs/add/observable/fromPromise';
import { Logger } from 'merit/core/logger';


// const request = require('superagent');
import * as request from 'superagent';

import * as _ from 'lodash';
import {Observable} from "rxjs/Observable";

@Injectable()
export class RateService {

  private _rates: Object;
  private _alternatives: Array<any>;
  private _ratesBCH: Object;
  private SAT_TO_BTC: any;
  private BTC_TO_SAT: any;
  private _isAvailable: boolean = false;

  private rateServiceUrl = 'https://bitpay.com/api/rates';

  constructor(
    private logger: Logger
  ) {
    this.logger.info('Hello RateService Service');
    this._rates = {};
    this._alternatives = [];
    this.SAT_TO_BTC = 1 / 1e8;
    this.BTC_TO_SAT = 1e8;
    this.updateRates();
  }

  async updateRates(): Promise<any> {
    try {
      const dataBTC = await Observable.fromPromise(this.getBTC())
          .timeout(1000)
          .toPromise();

      if (_.isEmpty(dataBTC)) {
          this.logger.warn("Could not update rates from rate Service");
      } else {
        _.each(dataBTC, (currency) => {
            this._rates[currency.code] = currency.rate;
            this._alternatives.push({
                name: currency.name,
                isoCode: currency.code,
                rate: currency.rate
            });
        });
      }
    } catch (errorBTC) {
        this.logger.warn("Error applying rates to wallet: ", errorBTC);
    }
  }

  async getBTC() {
    let res;
    try {
      res = await request['get'](this.rateServiceUrl);
    } catch (errorBTC) {
      this.logger.warn("Error connecting to rate service: ", errorBTC);
      return;
    }

    if (res && res.body) {
      return res.body;
    } else {
      throw new Error("Error connecting to rate service.");
    }
  }

  getRate(code) {
      return this._rates[code];
  }
  
  getAlternatives() {
    return this._alternatives;
  }

  fromMicrosToFiat(micros, code) {
    return micros * this.SAT_TO_BTC * this.getRate(code);
  }

  fromFiatToMicros(amount, code) {
    let micros = amount / this.getRate(code) * this.BTC_TO_SAT;
    return Math.ceil(micros);
  }

  fromMeritToFiat(merit, code) {
    let micros = this.mrtToMicro(merit);
    return this.fromMicrosToFiat(micros, code);
  }

  fromFiatToMerit(amount, code) {
    let micros = this.fromFiatToMicros(amount, code);
    return this.microsToMrt(micros);
  }

  mrtToMicro(mrt) {
    return mrt * this.BTC_TO_SAT;
  }

  microsToMrt(micros) {
    return micros * this.SAT_TO_BTC;
  }

  listAlternatives(sort: boolean) {
    let alternatives = _.map(this.getAlternatives(), (item) => {
      return {
        name: item.name,
        isoCode: item.isoCode
      }
    });

    if (sort) {
      alternatives.sort( (a, b) => {
        return a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1;
      });
    }

    return _.uniqBy(alternatives, 'isoCode');
  }

  //TODO IMPROVE WHEN AVAILABLE
  async whenAvailable(): Promise<any> {
    if (this._isAvailable) {
      return;
    } else {
      try {
        await this.updateRates();
      } catch (e) {
        this.logger.warn("Could not update rates: " + e);
      }
    }
  }

}
