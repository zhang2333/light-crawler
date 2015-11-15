'use strict';

var request = require('request');
var $ = require('cheerio');

var proxy = require('./proxy').proxy;

exports.crawl = function (callback) {
	var opts = {
		url: 'http://www.google.com',
		proxy: proxy
	};
	request(opts, function (e, r, body) {
		if(!e && r.statusCode == 200) {
			console.log(body);
		} else {
			console.error(e);
		}
		if(callback)
			callback();
	});
	
}


