var Model = {};

Model.Wallet = require('./wallet');
Model.Copayer = require('./copayer');
Model.TxProposal = require('./txproposal');
Model.Address = require('./address');
Model.Preferences = require('./preferences');
Model.TxNote = require('./txnote');
Model.Session = require('./session');
Model.TxConfirmationSub = require('./txconfirmationsub');
Model.ReferralTxConfirmationSub = require('./referraltxconfirmationsub');
Model.VaultTxConfirmationSub = require('./vaulttxconfirmationsub');

module.exports = Model;
