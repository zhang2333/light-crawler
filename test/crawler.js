'use strict';

var c = require('../lib/crawler');
var except = require('chai').except;

describe('Crawler', function () {
	describe('#crwal()', function () {
		it('test google', function (done) {
			c.crawl(done);
		});
	});
});

