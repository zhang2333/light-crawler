'use strict';

var Crawler = require('../lib/index');
var except = require('chai').except;

describe('Crawler', function () {
	describe('#crwal()', function () {
		this.timeout(10000);
		
		var c;
		
		before(function () {
			c = new Crawler();
		});
		
		it('test google', function (done) {
			var opts = {
				url: 'http://www.google.com'
			};
			c.crawl(opts, function () {
				done();
			});
		});
	});
});

