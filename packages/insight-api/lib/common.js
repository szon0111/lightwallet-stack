'use strict';

function Common(options) {
  this.log = options.log;
}

Common.prototype.notReady = function (err, res, p) {
  res.status(503).send('Server not yet ready. Sync Percentage:' + p);
};

Common.prototype.handleErrors = function (err, res) {
  if (err) {
    if (err.code)  {
      this.log.warn("Insight Error: " + err.message + '. Code:' + err.code);
      res.status(400).send(err.message + '. Code:' + err.code);
    } else {
      this.log.warn("Insight Error: ");
      this.log.warn(err.message);
      this.log.warn(err.stack);
      res.status(503).send(err.message);
    }
  } else {
    res.status(404).send('Not found');
  }
};

module.exports = Common;
