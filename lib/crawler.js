'use strict';

var request = require('request'),
	$ = require('cheerio'),
	_ = require('lodash');

var proxy = require('./proxy').proxy;

function Crawler() {
	this.defaultOpts = {
		proxy: proxy,
		timeout: 10000
	};
}

Crawler.prototype.crawl = function (opts, callback) {
	var self = this;
	
	opts = _.assign(self.defaultOpts, opts);
	request(opts, function (e, r, body) {
		if (!e && r.statusCode == 200) {
			console.log(body);
		} else {
			console.error(e.code || r.statusCode);
		}
		if (callback) {
			callback();
		}
	});
}

module.exports = Crawler;


