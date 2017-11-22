import { Injectable } from '@angular/core';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/toPromise';
import { Logger } from 'merit/core/logger';

import * as Promise from 'bluebird';
const request = require('superagent');

import * as _ from 'lodash';

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
    console.log('Hello RateService Service');
    this._rates = {};
    this._alternatives = [];
    this.SAT_TO_BTC = 1 / 1e8;
    this.BTC_TO_SAT = 1e8;
    this.updateRates();
  }

  updateRates(): Promise<any> {
    return new Promise ((resolve, reject) => {
      let self = this;
      return this.getBTC().timeout(1000).then((dataBTC) => {
        if (_.isEmpty(dataBTC)) {
          this.logger.warn("Could not update rates from rate Service");
          return resolve();
          //reject(new Error("Could not get conversion rate."))
        } else {
          _.each(dataBTC, (currency) => {
            self._rates[currency.code] = currency.rate;
            self._alternatives.push({
              name: currency.name,
              isoCode: currency.code,
              rate: currency.rate
            });
          });
          return resolve();
        }
      })
      .catch((errorBTC) => {
        console.log("JUICED ERROR: ", errorBTC);
        return resolve();
        //reject(errorBTC);
      });
    });
  }

  getBTC(): Promise<any> {
    return new Promise((resolve, reject) => {
      let r = request['get'](this.rateServiceUrl);
      return r.then((res) => {
        if (!res) {
          return reject("Error connecting to rate service.");
        }
        return resolve(res.body);
      });
    });
  }

  getRate(code) {
      return this._rates[code];
  };
  
  getAlternatives() {
    return this._alternatives;
  };
  
  toFiat(micros, code) {
    return micros * this.SAT_TO_BTC * this.getRate(code);
  };

  fromFiat(amount, code) {
    return amount / this.getRate(code) * this.BTC_TO_SAT;
  };

  listAlternatives(sort: boolean) {
    var self = this;
  
    var alternatives = _.map(this.getAlternatives(), (item) => {
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
  };

  //TODO IMPROVE WHEN AVAILABLE
  public whenAvailable(): Promise<any> { 
    return new Promise((resolve, reject)=> {
      if (this._isAvailable) {
        return resolve();
      } else {
       return this.updateRates().then(()=>{
          resolve();
        }).catch((err) => {
          this.logger.warn("Could not update rates: " + err);
          //reject(err);
        });
      }
    });

  }

}
