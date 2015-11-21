'use strict';

var util = require('util'),
	EventEmitter = require('events').EventEmitter;

var request = require('request'),
	async = require('async'),
	_ = require('lodash');

/**
 * constructor of Crawler
 */
function Crawler(opts) {
	this._init(opts);
}

util.inherits(Crawler, EventEmitter);

/**
 * initialize Crawler
 */
Crawler.prototype._init = function _init(opts) {
	var self = this;
	
	self._tasks = [];
	self._rules = {};
	self._taskCache = '';

	self.taskCounter = 0;
	self.failCounter = 0;
	self.settings = {
		interval: 0,
		retry: 3,
		timeout: 10000,
		concurrency: 1,
		skipRepetitiveTask: true
	};
	self.errLog = '';
	if (opts) {
		self.settings = _.assign(self.settings, opts);
	}
	
	self.on('pollTask', function () {
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
						self.emit('pollTask');
					}
				});
				idle--;
			}
		}
	});
	
	// processing of task pool
	self.q = async.queue(function (task, done) {
		var crawl = function crawl() {
			if (self.settings.skipRepetitiveTask) {
				self._taskCache = self._taskCache.concat(task + '|');
			}
			console.log(util.format('Current No.%s: %s', self.taskCounter + 1, task));
			self._crawl(task, function (result) {
				Object.keys(self._rules).forEach(function (rule) {
					if (new RegExp(rule).test(result.url)) {
						self._rules[rule](result.data);
						done();
					}
				});
			});
		};
		
		// deferred execution for crawl's interval
		if (self.settings.interval != 0) {
			console.log('Crawler is sleeping...');
			setTimeout(crawl, self.settings.interval);
		} else {
			crawl();
		}
	}, self.settings.concurrency);
	
	self.q.drain = function () {
		console.log(util.format('[Crawler Finished] Total: %s.Success: %s.Fail: %s.',
			self.taskCounter, self.taskCounter - self.failCounter, self.failCounter));
		if (self.errLog.length > 0) {
			console.log(self.errLog);
		}
		if (self.onTaskPoolDrain) {
			self.onTaskPoolDrain();
		}
	};
};

/**
 * twist crawler's settings
 * @param <object> setting
 */
Crawler.prototype.twistSettings = function twistSettings(setting) {
	this.settings = _.assign(this.settings, setting);
	return this;
}

/**
 * add urls to task pool
 * @param <array[string]> urls : array of url
 */
Crawler.prototype.addTasks = function addTasks(urls) {
	var self = this;
	if (typeof (urls) == 'string') {
		if (self.settings.skipRepetitiveTask && new RegExp(urls).test(self._taskCache)) {
			return self;
		}
		self._tasks.push(urls);
	} else {
		urls = _.uniq(urls);
		if (self.settings.skipRepetitiveTask) {
			urls = urls.filter(function (url) {
				return !new RegExp(url).test(self._taskCache);
			});
		}
		self._tasks = self._tasks.concat(urls);
	}
	return self;
}

/**
 * add crawl's rule
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

	var retry = 0;

	var id = ++self.taskCounter;

	var func = function func(cb) {
		request(opts, function (e, r, body) {
			if (!e && r.statusCode == 200) {
				cb(null, { url: url, data: body });
			} else {
				var info = e ? e.code : r.statusCode;
				console.log(util.format('[Retry][%s][%s] : %s', info, ++retry, url));
				if (retry == self.settings.retry) {
					self.failCounter++;
					self.errLog = self.errLog.concat(util.format('[Retry Failed][No.%s][%s]%s\n', id, info, url));
				}
				cb(info);
			}
		});
	};

	async.retry({
		times: self.settings.retry,
		interval: self.settings.interval
	}, func, function (e, result) {
		if (e) {
			callback({ url: url });
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
		console.error('Task pool has nothing!');
		if (callback) {
			return callback();
		}
		return;
	}
	
	if (callback) {
		self.onTaskPoolDrain = callback;
	}

	console.log('[Crawler Started]');

	self.emit('pollTask');
}

module.exports = Crawler;
