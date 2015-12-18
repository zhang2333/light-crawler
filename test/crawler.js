'use strict';

var util = require('util'),
	path = require('path'),
	fs = require('fs');

var expect = require('chai').expect;

var Crawler = require('../index');

describe('Crawler', function () {
	describe('#crwal()', function () {
		this.timeout(80000);

		var c;

		it('simple test: single url', function (done) {
			var url = 'http://www.google.com';
			c = new Crawler({ id: 'simple test' });
			c.addTasks(url).addRule(function (result) {
				expect(result.body).to.be.ok;
			}).start(function () {
				done();
			});
		});

		it('test timeout retry', function (done) {
			var url = 'http://www.google.com';
			c = new Crawler({ requestOpts: {
				timeout: 10
			}});
			c.addTasks(url).addRule(function (result) {
				expect(result.body).to.not.exist;
			}).start(function () {
				done();
			});
		});

		it('test array interval concurrency', function (done) {
			c = new Crawler({ interval: 500, concurrency: 2 });
			c.addTasks(['http://www.baidu.com', 'http://www.google.com'], { type: 'SE' });
			c.addTasks(['http://www.tudou.com', 'http://www.nhk.or.jp'], { type: 'Other' });
			c.addRule(function (result) {
				expect(result.body).to.be.ok;
				console.log(result.task.url);
				if (result.task.id <= 2) {
					expect(result.task.type).to.be.equal('SE');
				} else {
					expect(result.task.type).to.be.equal('Other');
				}
			}).start(function () {
				done();
			});
		});

		it('test repetitive tasks', function (done) {
			var urls = ['http://www.baidu.com', 'http://www.baidu.com',
				'http://www.baidu.com', 'http://www.tudou.com'];
			c = new Crawler({ interval: 500 });
			c.addTasks(urls).addRule(function (result) { }).start(function () {
				expect(c.taskCounter).to.be.equal(3);
				done();
			});
			setTimeout(function () {
				c.addTasks('http://www.baidu.com');
				c.addTasks(['http://www.baidu.com', 'http://www.sohu.com']);
			}, 1000);
		});
		
		it('test download', function (done) {
			c = new Crawler({ id: 'download test' });
			var url = 'http://gmade.net/dealer/images/gmade_stealth.jpg';
			c.addTasks(url, {downloadTask: true, downloadFile: 'test.jpg'});
			c.start(function () {
				fs.unlinkSync(path.resolve(c.settings.downloadDir, 'test.jpg'));
				done();
			});
		});
		
		it('test pause/resume', function (done) {
			c = new Crawler({ 
				id: 'pause/resume',
				interval: 500
			});
			c.addTasks(['http://www.baidu.com', 'http://www.google.com', 'http://www.tudou.com', 'http://www.nhk.or.jp']);
			c.addRule(function (r) {
				expect(r.body).to.be.ok;
			});
			c.start(function () {
				expect(c.taskCounter).to.be.equal(4);
				done();
			});
			setTimeout(function() {
				c.pause();
				setTimeout(function() {
					expect(c.isPaused()).to.be.true;
					c.resume();
				}, 1000);
			}, 1000);
		});
	});
});
