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
	this._tasks = [];
	this._rules = {};
	this._emitter = new events.EventEmitter();
	this._taskCache = '';

	this.taskCounter = 0;
	this.settings = {
		interval: 0,
		retry: 3,
		timeout: 10000,
		concurrency: 1,
		skipRepetitiveTask: true
	};
	if (opts) {
		this.settings = _.assign(this.settings, opts);
	}
}

/**
 * twist settings of crawler
 * @param <object> setting
 */
Crawler.prototype.twistSettings = function twistSettings(setting) {
	this.settings = _.assign(this.settings, setting);
	return this;
}

/**
 * add urls to task queue
 * @param <array[string]> urls : array of url
 */
Crawler.prototype.addTasks = function addTasks(urls) {
	var self = this;
	if (typeof (urls) == 'string') {
		if (self.settings.skipRepetitiveTask && self._taskCache.indexOf(urls) != -1) {
			return self;
		}
		self._tasks.push(urls);
	} else {
		urls = _.uniq(urls);
		if (self.settings.skipRepetitiveTask) {
			urls = urls.filter(function (url) {
				return self._taskCache.indexOf(url) == -1;
			});
		}
		self._tasks = self._tasks.concat(urls);
	}
	return self;
}

/**
 * add rule of crawl
 * @param <string> reg : reg string
 * @param <function> func : processing Data
 */
Crawler.prototype.addRule = function addRule(reg, func) {
	if (typeof (reg) == 'string') {
		this._rules[reg] = func;
	} else {
		this._rules['.*'] = reg;
	}
	return this;
}

/**
 * fetch/crawl a single page for task
 * @param <string> url : url of crawling page
 * @param <function> callback
 */
Crawler.prototype._crawl = function _crawl(url, callback) {
	var self = this;

	var opts = _.assign(_.pick(self.settings, ['proxy', 'timeout']), { url: url });

	var t = 0;

	self.taskCounter++;

	var func = function func(cb) {
		request(opts, function (e, r, body) {
			if (!e && r.statusCode == 200) {
				cb(null, { url: url, data: body });
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
Crawler.prototype.start = function start(callback) {
	var self = this;

	if (self._tasks.length == 0) {
		console.error('Task queue has nothing!');
		if (callback) {
			return callback();
		}
		return;
	}

	console.log('Crawler is starting...');

	self._emitter.on('processTask', function () {
		var size = self.settings.concurrency;
		size = size <= self._tasks.length ? size : self._tasks.length;
		if (self.q.length() < size) {
			var idle = size - self.q.length();
			var ts = self._tasks.splice(0, idle);
			while (idle != 0) {
				self.q.push(ts[ts.length - idle], function (err) {
					if (err) {
						return console.error(err);
					}
					if (self._tasks.length > 0) {
						self._emitter.emit('processTask');
					}
				});
				idle--;
			}
		}
	});

	self.q = async.queue(function (task, done) {
		var crawl = function crawl() {
			if (self.settings.skipRepetitiveTask) {
				self._taskCache = self._taskCache.concat(task + '|');
			}
			console.log(util.format('Current No.%s: %s', self.taskCounter + 1, task));
			self._crawl(task, function (result) {
				done();
				if (result) {
					Object.keys(self._rules).forEach(function (rule) {
						if (new RegExp(rule).test(result.url)) {
							self._rules[rule](result.data);
						}
					});
				}
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
		console.log(util.format('Crawler has done.Total: %s.', self.taskCounter));
		if (callback) {
			callback();
		}
	};

	self._emitter.emit('processTask');
}

module.exports = Crawler;
