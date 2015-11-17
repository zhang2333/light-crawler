'use strick';

var $ = require('cheerio');

exports.getLinks = function getLinks(html) {
	var arr = [];
	$(html).find('a').each(function (i, e) {
		arr[i] = $(this).attr('href');
	});
	return arr;
};
