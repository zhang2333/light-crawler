'use strict';

var util = require('util');

var expect = require('chai').expect;

var Crawler = require('../index');

// http-proxy
var proxy = require('../t/proxy').proxy;

describe('Crawler', function () {
	describe('#crwal()', function () {
		this.timeout(30000);

		var c;

		it('simple test: single url', function (done) {
			var url = 'http://www.google.com';
			c = new Crawler({ proxy: proxy });
			c.addTasks(url).addRule(function (data) {
				expect(data).to.be.ok;
			}).start(function () {
				done();
			});
		});

		it('test timeout retry', function (done) {
			var url = 'http://www.google.com';
			c = new Crawler({ proxy: proxy, timeout: 10 });
			c.addTasks(url).addRule(function (data) {
				expect(data).to.not.be.ok;
			}).start(function () {
				done();
			});
		});

		it('test array interval concurrency', function (done) {
			var urls = ['http://www.baidu.com', 'http://www.google.com',
				'http://www.sina.com', 'http://www.nhk.or.jp'];
			c = new Crawler({ proxy: proxy, interval: 1500, concurrency: 2 });
			c.addTasks(urls).addRule(function (data) {
				expect(data).to.be.ok;
			}).start(function () {
				done();
			});
		});

		it('test repetitive tasks', function (done) {
			var urls = ['http://www.baidu.com', 'http://www.baidu.com',
				'http://www.baidu.com', 'http://www.sina.com'];
			c = new Crawler({ proxy: proxy, interval: 1500 });
			c.addTasks(urls).addRule(function (data) { }).start(function () {
				expect(c.taskCounter).to.be.equal(3);
				done();
			});
			setTimeout(function () {
				c.addTasks('http://www.baidu.com');
				c.addTasks(['http://www.baidu.com', 'http://www.sohu.com']);
			}, 1600);
		});
	});
});
