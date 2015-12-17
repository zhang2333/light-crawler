'use strick';

var fs = require('fs');

var $ = require('cheerio');

// get links from html
exports.getLinks = function getLinks(html) {
	var arr = [];
	$(html).find('a').each(function (i, e) {
		arr[i] = $(this).attr('href');
	});
	return arr;
};

// load request headers from file
exports.loadHeaders = function loadHeaders(file) {
	try {
		var content = fs.readFileSync(file, 'utf8');
		var separator = process.platform == 'win32' ? '\r\n' : '\n';
		var arr = content.split(separator);
		var headers = {};
		for (var i in arr) {
			var map = arr[i].split(':');
			map[1] = map[1].length - map[1].lastIndexOf('\r') == 1 ? map[1].slice(0, map[1].length-1) : map[1];
			headers[map[0]] = map[1];
		}
		return headers;
	} catch (err) {
		console.log('Load Headers Error');
		console.error(err);
		return {};
	}
};
