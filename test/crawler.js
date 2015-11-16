'use strict';

var Crawler = require('../lib/index'),
	$ = require('cheerio'),
	expect = require('chai').expect;

// http-proxy
var proxy = require('../lib/proxy').proxy;

describe('Crawler', function () {
	describe('#crwal()', function () {
		this.timeout(30000);

		var c;
		beforeEach(function () {
			c = new Crawler({proxy: proxy});
		});

		it('simple test: single url', function (done) {
			var url = 'http://www.google.com';
			c.addTask(url);
			c.handle = function (data) {
				expect(data).to.be.ok;
			};
			c.start(function () {
				done();
			});
		});

		it('simple test: url array', function (done) {
			var urls = ['http://www.baidu.com', 'http://www.google.com', 
						'http://www.sina.com', 'http://www.nhk.or.jp'];
			c.addTasks(urls);
			c.handle = function (data) {
				expect(data).to.be.ok;
			};
			c.start(function () {
				done();
			});
		});
	});
});

