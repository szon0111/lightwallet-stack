const request = require('request');

function SmsNotificationService(opts) {
  this.messageBroker = opts.messageBroker || new MessageBroker(opts.messageBrokerOpts);
  this.messageBroker.onMessage(this.sendSMS.bind(this));
  this.notificationsServiceUrl = opts.notificationsServiceUrl || process.env.notificationsServiceUrl || 'http://localhost:8300';

  if (opts.storage) {
    this.storage = opts.storage;
  } else {
    this.storage = new Storage();
    this.storage.connect(opts.storageOpts, () => {});
  }
}

SmsNotificationService.prototype.sendSMS = function(notification, cb) {
  if (notification.type == 'NewTxProposal') return cb();

  this.storage.fetchSmsNotificationSub(notification.walletId, (err, recipient) => {
    if (err) return cb(err);
    if (!recipient) return cb();

    request({
      method: 'POST',
      uri: this.notificationsServiceUrl + '/notification',
      json: {
        type: 'sms',
        destination: recipient.phoneNumber,
        id: notification.id,
        data: notification.data,
        template: notification.type,
        language: 'en'
      }
    }, (err, response) => {
      if (!err && parseInt(response.statusCode) === 200) {
        cb(err || 'Unexpected error');
      } else {
        cb();
      }
    });
  });
};

module.exports = SmsNotificationService;
