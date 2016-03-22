'use strick';

var fs = require('fs'),
    url = require('url'),
    path = require('path');

var $ = require('cheerio');

// get urls
function getUrls(tag, attr, html, baseUrl) {
    var arr = [];
	$(html).find(tag).each(function (i, e) {
        var link = $(this).attr(attr);
        if (link && link.length > 0) {
            arr.push(baseUrl ? url.resolve(baseUrl, link) : link);
        }
	});
	return arr;
}

// get links from html
exports.getLinks = function getLinks(html, baseUrl) {
	return getUrls('a', 'href', html, baseUrl);
};

// get images from html
exports.getImages = function getImages(html, baseUrl) {
	return getUrls('img', 'src', html, baseUrl);
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

// get reg string with path of fromUrl
exports.getRegWithPath = function getRegWithPath(fromUrl) {
    return path.dirname(fromUrl) + '/**';
}
