'use strict';

var _ = require('lodash');

var errors = require('./errors');
var $ = require('./util/preconditions');

var UNITS = {
  'MRT'      : [1e8, 8],
  'mMRT'     : [1e5, 5],
  'uMRT'     : [1e2, 2],
  'quanta'   : [1, 0]
};

/**
 * Utility for handling and converting merits units. The supported units are
 * MRT, mMRT,uMRT and quanta. A unit instance can be created with an
 * amount and a unit code, or alternatively using static methods like {fromMRT}.
 * It also allows to be created from a fiat amount and the exchange rate, or
 * alternatively using the {fromFiat} static method.
 * You can consult for different representation of a unit instance using it's
 * {to} method, the fixed unit methods like {toQuanta} or alternatively using
 * the unit accessors. It also can be converted to a fiat amount by providing the
 * corresponding MRT/fiat exchange rate.
 *
 * @example
 * ```javascript
 * var quanta = Unit.fromMRT(1.3).toQuanta();
 * ```
 *
 * @param {Number} amount - The amount to be represented
 * @param {String|Number} code - The unit of the amount or the exchange rate
 * @returns {Unit} A new instance of an Unit
 * @constructor
 */
function Unit(amount, code) {
  if (!(this instanceof Unit)) {
    return new Unit(amount, code);
  }

  // convert fiat to MRT
  if (_.isNumber(code)) {
    if (code <= 0) {
      throw new errors.Unit.InvalidRate(code);
    }
    amount = amount / code;
    code = Unit.MRT;
  }

  this._value = this._from(amount, code);

  var self = this;
  var defineAccesor = function(key) {
    Object.defineProperty(self, key, {
      get: function() { return self.to(key); },
      enumerable: true,
    });
  };

  Object.keys(UNITS).forEach(defineAccesor);
}

Object.keys(UNITS).forEach(function(key) {
  Unit[key] = key;
});

/**
 * Returns a Unit instance created from JSON string or object
 *
 * @param {String|Object} json - JSON with keys: amount and code
 * @returns {Unit} A Unit instance
 */
Unit.fromObject = function fromObject(data){
  $.checkArgument(_.isObject(data), 'Argument is expected to be an object');
  return new Unit(data.amount, data.code);
};

/**
 * Returns a Unit instance created from an amount in MRT
 *
 * @param {Number} amount - The amount in MRT
 * @returns {Unit} A Unit instance
 */
Unit.fromMRT = function(amount) {
  return new Unit(amount, Unit.MRT);
};

/**
 * Returns a Unit instance created from an amount in mMRT
 *
 * @param {Number} amount - The amount in mMRT
 * @returns {Unit} A Unit instance
 */
Unit.fromMillis = Unit.fromMilis = function(amount) {
  return new Unit(amount, Unit.mMRT);
};

/**
 * Returns a Unit instance created from an amount in quanta
 *
 * @param {Number} amount - The amount in quanta
 * @returns {Unit} A Unit instance
 */
Unit.fromQuanta = function(amount) {
  return new Unit(amount, Unit.quanta);
};

/**
 * Returns a Unit instance created from a fiat amount and exchange rate.
 *
 * @param {Number} amount - The amount in fiat
 * @param {Number} rate - The exchange rate MRT/fiat
 * @returns {Unit} A Unit instance
 */
Unit.fromFiat = function(amount, rate) {
  return new Unit(amount, rate);
};

Unit.prototype._from = function(amount, code) {
  if (!UNITS[code]) {
    throw new errors.Unit.UnknownCode(code);
  }
  return parseInt((amount * UNITS[code][0]).toFixed());
};

/**
 * Returns the value represented in the specified unit
 *
 * @param {String|Number} code - The unit code or exchange rate
 * @returns {Number} The converted value
 */
Unit.prototype.to = function(code) {
  if (_.isNumber(code)) {
    if (code <= 0) {
      throw new errors.Unit.InvalidRate(code);
    }
    return parseFloat((this.MRT * code).toFixed(2));
  }

  if (!UNITS[code]) {
    throw new errors.Unit.UnknownCode(code);
  }

  var value = this._value / UNITS[code][0];
  return parseFloat(value.toFixed(UNITS[code][1]));
};

/**
 * Returns the value represented in MRT
 *
 * @returns {Number} The value converted to MRT
 */
Unit.prototype.toMRT = function() {
  return this.to(Unit.MRT);
};

/**
 * Returns the value represented in mMRT
 *
 * @returns {Number} The value converted to mMRT
 */
Unit.prototype.toMillis = Unit.prototype.toMilis = function() {
  return this.to(Unit.mMRT);
};

/**
 * Returns the value represented in quanta
 *
 * @returns {Number} The value converted to quanta
 */
Unit.prototype.toQuanta = function() {
  return this.to(Unit.quanta);
};

/**
 * Returns the value represented in fiat
 *
 * @param {string} rate - The exchange rate between MRT/currency
 * @returns {Number} The value converted to quanta
 */
Unit.prototype.atRate = function(rate) {
  return this.to(rate);
};

/**
 * Returns a the string representation of the value in quanta
 *
 * @returns {string} the value in quanta
 */
Unit.prototype.toString = function() {
  return this.quanta + ' quanta';
};

/**
 * Returns a plain object representation of the Unit
 *
 * @returns {Object} An object with the keys: amount and code
 */
Unit.prototype.toObject = Unit.prototype.toJSON = function toObject() {
  return {
    amount: this.MRT,
    code: Unit.MRT
  };
};

/**
 * Returns a string formatted for the console
 *
 * @returns {string} the value in quanta
 */
Unit.prototype.inspect = function() {
  return '<Unit: ' + this.toString() + '>';
};

module.exports = Unit;
