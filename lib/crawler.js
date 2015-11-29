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
		concurrency: 1,
		skipRepetitiveTask: true
	};
	self.requestOpts = {
		timeout: 10000
	};
	self.errLog = '';
	
	self.twist(opts);
	
	// register listening 'pollTask'
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
			// cache task
			if (self.settings.skipRepetitiveTask) {
				self._taskCache = self._taskCache.concat(task.url + '|');
			}
			
			// log current
			console.log(util.format('Current No.%s: %s', self.taskCounter + 1, task.url));
			
			// call _crawl
			self._crawl(task, function (result) {
				// match rule
				var flag = false;
				Object.keys(self._rules).forEach(function (rule) {
					if (flag) {
						return;
					}
					if (new RegExp(rule).test(result.task.url)) {
						try {
							self._rules[rule](result);
						} catch (err) {
							self.errLog = self.errLog.concat(util.format('[Processing Error][No.%s]%s\n[%s]\n', 
																result.task.id, result.task.url, err));
						} finally {
							flag = true;
							done();
						}
					}
				});
				// no matched
				if (!flag) {
					self.errLog = self.errLog.concat(util.format('[No Rule Matched][No.%s]%s\n', result.task.id, result.task.url));
					done();
				}
			});
		};
		
		// deferred execution for crawl's interval
		if (self.settings.interval != 0 && self.taskCounter != 0) {
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
Crawler.prototype.twist = function twist(opts) {
	var self = this;
	if (opts) {
		if (opts.requestOpts) {
			self.requestOpts = _.assign(self.requestOpts, opts.requestOpts);
			delete opts.requestOpts;
		}
		self.settings = _.assign(self.settings, opts);
	}
	return self;
}

/**
 * add tasks to task pool
 * @param <array[string]> urls : array of url
 */
Crawler.prototype.addTasks = function addTasks(taskUrls, props) {
	var self = this;
	var taskProps = props ? props : {};
	if(Array.isArray(taskUrls)) {
		taskUrls = _.uniq(taskUrls);
		if (self.settings.skipRepetitiveTask) {
			taskUrls = taskUrls.filter(function (url) {
				return !new RegExp(url).test(self._taskCache);
			});
		}
		for (var i in taskUrls) {
			 self._tasks.push(_.assign({url:taskUrls[i]}, taskProps));
		}
	} else if (typeof (taskUrls) == 'string') {
		if (self.settings.skipRepetitiveTask && new RegExp(taskUrls).test(self._taskCache)) {
			return self;
		}
		self._tasks.push(_.assign({url:taskUrls}, taskProps));
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
		reg = reg.replace(/\./g, '\\.').replace(/\*\*/g, '.*');
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
Crawler.prototype._crawl = function _crawl(task, callback) {
	var self = this;

	var opts = _.assign(self.requestOpts, { url: task.url });
	if (opts.proxy == '') {
		delete opts.proxy;
	}
	if (task.requestOpts) {
		opts = _.assign(opts, task.requestOpts);
	}

	task.retry = 0;

	task.id = ++self.taskCounter;

	var func = function func(cb) {
		request(opts, function (e, r, body) {
			if (!e && r.statusCode == 200) {
				cb(null, { task: task, body: body });
			} else {
				var info = e ? e.code : r.statusCode;
				console.log(util.format('[Retry][%s][%s] : %s', info, ++task.retry, task.url));
				if (task.retry == self.settings.retry) {
					self.failCounter++;
					self.errLog = self.errLog.concat(util.format('[Retry Failed][No.%s][%s]%s\n', task.id, info, task.url));
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
			callback({ task: task });
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
