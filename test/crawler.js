'use strict';

var Crawler = require('../lib/index'),
	$ = require('cheerio'),
	expect = require('chai').expect;

describe('Crawler', function () {
	describe('#crwal()', function () {
		this.timeout(10000);

		var c;

		beforeEach(function () {
			c = new Crawler();
		});

		it('simple test: single url', function (done) {
			var url = 'http://www.baidu.com';
			c.addTask(url);
			c.handle = function (data) {
				expect(data).to.be.ok;
			};
			c.start(function () {
				done();
			});
		});

		it('simple test: url array', function (done) {
			var urls = ['http://www.baidu.com', 'http://www.google.com'];
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

