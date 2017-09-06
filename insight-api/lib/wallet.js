'use strict';

var Common = require('./common');

function WalletController(node) {
  this.node = node;
  this.common = new Common({log: this.node.log});
}

WalletController.prototype.unlock = function(req, res) {
  var self = this;
  var code = req.params.code;

  self.node.services.bitcoind.unlockWallet(code, function(err, result) {
    if(err) {
      return self.common.handleErrors(err, res);
    }

    res.jsonp(result);
  });
};

module.exports = WalletController;
