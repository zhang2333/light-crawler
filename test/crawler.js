'use strict';

var expect = require('chai').expect;

var Crawler = require('../index');

// http-proxy
var proxy = require('../t/proxy').proxy;

describe('Crawler', function () {
	describe('#crwal()', function () {
		this.timeout(50000);

		var c;
		beforeEach(function () {
			c = new Crawler({ proxy: proxy });
		});

		it('simple test: single url', function (done) {
			var url = 'http://www.google.com';
			c.addTasks(url).addRule(function (data, callback) {
				expect(data).to.be.ok;
				callback();
			}).start(function () {
				done();
			});
		});

		it('test timeout retry', function (done) {
			var url = 'http://www.google.com';
			c.settings.timeout = 10;
			c.addTasks(url).addRule(function (data, callback) {
				expect(data).to.not.be.ok;
				callback();
			}).start(function () {
				done();
			});
		});

		it('test array interval concurrency', function (done) {
			var urls = ['http://www.baidu.com', 'http://www.google.com',
				'http://www.sina.com', 'http://www.nhk.or.jp'];
			c.twistSettings({ interval: 1500, concurrency: 2 });
			c.addTasks(urls).addRule(function (data, callback) {
				expect(data).to.be.ok;
				callback();
			}).start(function () {
				done();
			});
		});

		it('test repetitive tasks', function (done) {
			var urls = ['http://www.baidu.com', 'http://www.baidu.com',
				'http://www.baidu.com', 'http://www.sina.com'];
			c.settings.interval = 1500;
			c.addTasks(urls).addRule(function (data, callback) { 
				callback();
			}).start(function () {
				expect(c.taskCounter).to.be.equal(3);
				done();
			});
			setTimeout(function () {
				c.addTasks('http://www.baidu.com');
				c.addTasks(['http://www.baidu.com', 'http://www.sohu.com']);
			}, 1600);
		});
		
		it('test retry failed', function (done) {
			var urls = ['http://www.zhihu.com'];
			c.addTasks(urls).addRule(function (data, callback) { 
				callback();
			}).start(function () {
				expect(c.errLog).to.have.length.above(0);
				done();
			});
		});
	});
});
