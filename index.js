'use strick';

module.exports = require('./lib/crawler');

var utils = require('./lib/utils');
for (var func in utils) {
    module.exports[func] = utils[func];
}
