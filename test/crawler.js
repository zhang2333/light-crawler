'use strict';

var expect = require('chai').expect;

var Crawler = require('../index');

// http-proxy
var proxy = require('../t/proxy').proxy;

describe('Crawler', function () {
	describe('#crwal()', function () {
		this.timeout(30000);

		var c;
		beforeEach(function () {
			c = new Crawler({ proxy: proxy });
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

		it('test timeout retry', function (done) {
			var url = 'http://www.google.com';
			c.settings.timeout = 10;
			c.addTask(url);
			c.handle = function (data) {
				expect(data).to.not.be.ok;
			};
			c.start(function () {
				done();
			});
		});
		
		it('test array interval concurrency', function (done) {
			var urls = ['http://www.baidu.com', 'http://www.google.com',
				'http://www.sina.com', 'http://www.nhk.or.jp'];
			c.settings.interval = 1500;
			c.settings.concurrency = 2;
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
