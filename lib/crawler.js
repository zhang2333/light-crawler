'use strict';

var util = require('util'),
	events = require('events');

var request = require('request'),
	async = require('async'),
	_ = require('lodash');

/**
 * constructor of Crawler
 */
function Crawler(opts) {
	this.tasks = [];
	this.taskCounter = 1;
	this.emitter = new events.EventEmitter();
	this.settings = {
		interval: 0,
		retry: 3,
		timeout: 10000,
		concurrency: 1
	};
	if (opts) {
		this.settings = _.assign(this.settings, opts);
	}
}

/**
 * add a url to task queue
 * @param <string> url : url of task
 */
Crawler.prototype.addTask = function (url) {
	this.tasks.push(url);
	return this;
}

/**
 * add urls to task queue
 * @param <array[string]> urls : array of url
 */
Crawler.prototype.addTasks = function (urls) {
	this.tasks = this.tasks.concat(urls);
	return this;
}

/**
 * fetch/crawl a single page for task
 * @param <string> url : url of crawling page
 * @param <function> callback
 */
Crawler.prototype._crawl = function (url, callback) {
	var self = this;

	var opts = _.assign(_.pick(self.settings, ['proxy', 'timeout']), { url: url });

	var t = 0;

	self.taskCounter++;

	var func = function func(cb) {
		request(opts, function (e, r, body) {
			if (!e && r.statusCode == 200) {
				cb(null, body);
			} else {
				var info = e ? e.code : r.statusCode;
				console.log(util.format('[Retry][%s][%s] : %s', info, ++t, url));
				cb(info);
			}
		});
	};

	async.retry({
		times: self.settings.retry,
		interval: self.settings.interval
	}, func, function (e, result) {
		if (e) {
			callback();
		} else {
			callback(result);
		}
	});
}

/**
 * start the Crawler
 * @param <function> callback
 */
Crawler.prototype.start = function (callback) {
	var self = this;

	if (self.tasks.length == 0) {
		console.error('Task queue has nothing!');
		if (callback) {
			return callback();
		}
		return;
	}

	console.log('Crawler is starting...');

	self.emitter.on('processTask', function () {
		var size = self.settings.concurrency;
		size = size <= self.tasks.length ? size : self.tasks.length;
		if (self.q.length() < size) {
			var idle = size - self.q.length();
			var ts = self.tasks.splice(0, idle);
			while (idle != 0) {
				self.q.push(ts[ts.length - idle], function (err) {
					if (err) {
						return console.error(err);
					}
					if (self.tasks.length > 0) {
						self.emitter.emit('processTask');
					}
				});
				idle--;
			}
		}
	});

	self.q = async.queue(function (task, done) {
		var crawl = function crawl() {
			console.log(util.format('Current No.%s: %s', self.taskCounter, task));
			self._crawl(task, function (data) {
				self.handle(data);
				done();
			});
		};
		if (self.settings.interval != 0) {
			console.log('Crawler is sleeping...');
			setTimeout(crawl, self.settings.interval);
		} else {
			crawl();
		}
	}, self.settings.concurrency);

	self.q.drain = function () {
		console.log(util.format('Crawler has done.Total: %s.', self.taskCounter - 1));
		if (callback) {
			callback();
		}
	};

	self.emitter.emit('processTask');
}

module.exports = Crawler;
