'use strict';

var util = require('util'),
	path = require('path'),
	fs = require('fs'),
	EventEmitter = require('events').EventEmitter;

var Promise = require('bluebird'),
	_ = require('lodash'),
	rp = require('request-promise'),
	request = require('request');

/**
 * constructor of Crawler
 */
function Crawler(opts) {
	this._init(opts);
}

// inherits from EventEmitter
util.inherits(Crawler, EventEmitter);

/**
 * initialize Crawler
 */
Crawler.prototype._init = function _init(opts) {
	var self = this;

	// private props
	self._tasks = [];
	self._rules = {};
	self._taskCache = '';

	// public props
	self.taskCounter = 0;
	self.failCounter = 0;
	self.settings = {
		interval: 0,
		retry: 3,
		concurrency: 1,
		skipRepetitiveTask: true,
		downloadDir: path.dirname(__dirname),
		finishTimeout: 1000
	};
	// options of task request
	self.requestOpts = {
		timeout: 10000
	};
	self.errLog = '';

	self.tweak(opts);
	
	// register listening 'pollTask', push tasks into task-pool
	self.on('pollTask', function () {
		Promise.map(self._tasks, function (task) {
			return self._crawl(task);
		}, { concurrency: self.settings.concurrency })
		.then(function () {
			if (self._tasks.length !== 0) {
				self.emit('pollTask');
			} else {
				if (self.onFinished) {
					self.onFinished();
				}
			}
		});
	});
	
	// processing of task pool


	// drain task-pool
	
};

/**
 * tweak crawler's settings
 * @param <object> setting
 */
Crawler.prototype.tweak = function tweak(opts) {
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
 * @param <string || array[string]> urls
 * @param <object> props : properties of task
 */
Crawler.prototype.addTasks = function addTasks(taskUrls, props) {
	var self = this;
	
	if (self.finished) { return self; }
	
	var taskProps = props ? props : {};
	if (Array.isArray(taskUrls)) {
		taskUrls = _.uniq(taskUrls);
		if (self.settings.skipRepetitiveTask) {
			taskUrls = taskUrls.filter(function (url) {
				return !new RegExp(url).test(self._taskCache);
			});
		}
		for (var i in taskUrls) {
			self._tasks.push(_.assign({ url: taskUrls[i] }, taskProps));
		}
	} else if (typeof (taskUrls) == 'string') {
		if (self.settings.skipRepetitiveTask && new RegExp(taskUrls).test(self._taskCache)) {
			return self;
		}
		self._tasks.push(_.assign({ url: taskUrls }, taskProps));
	}
	
	if (self.drained && self._tasks.length != 0) {
		self.emit('pollTask');
	}
	
	return self;
}

/**
 * add crawl's rule
 * @param <string> reg : reg string
 * @param <function> func : processing result
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
 * fetch/crawl a page for the task
 * @param <object> task
 * @param <function> callback
 */
Crawler.prototype._crawl = function _crawl(task, callback) {
	var self = this;

	// init options of the request
	var opts = _.assign(self.requestOpts, { url: task.url });
	if (opts.proxy == '') {
		delete opts.proxy;
	}
	if (task.requestOpts) {
		opts = _.assign(opts, task.requestOpts);
	}

	// retry times
	task.retry = 0;
	task.id = ++self.taskCounter;
	
	// log error info
	var logError = function logError(info) {
		self.log(util.format('[Retry][%s][%s] : %s', info, ++task.retry, task.url));
		if (task.retry == self.settings.retry) {
			self.failCounter++;
			self.log(util.format('[Retry Failed][No.%s][%s]%s', task.id, info, task.url), true);
		}
	}
	
	return new Promise(function (resolve, reject) {
		rp(opts).then(function (html) {
			self._tasks.shift();
			for (var r in self._rules) {
				if (new RegExp(r).test(task.url)) {
					process.nextTick(function (html) {
						// excute rule
						self._rules[r]({ task: task, body: html });
					}, html);
					break;
				}
			}
			resolve();
		}).catch(function (reason) {
			logError(reason.statusCode ? reason.statusCode : reason.cause);
		});
	});

}


function _reqDownload(opts) {
	
}

/**
 * start the Crawler
 * @param <function> callback: onFinished
 */
Crawler.prototype.start = function start(callback) {
	var self = this;

	// empty task-pool
	if (self._tasks.length == 0) {
		self.log('Task pool has nothing!');
		if (callback) {
			return callback();
		}
		return;
	}

	if (callback) {
		self.onFinished = callback;
	}
	
	self.finished = false;
	
	self.log('[Crawler is Started]');
	
	if (Object.keys(self._rules).length == 0) {
		self._rules['.*'] = function (r){};
	}

	// start task-pool
	self.emit('pollTask');
	
	return self;
}

/**
 * pause the Crawler
 */
Crawler.prototype.pause = function pause() {
	this.q.pause();
	this.log('[Crawler is Paused]');
	return this;
};

/**
 * resume the Crawler
 */
Crawler.prototype.resume = function resume() {
	this.q.resume();
	this.log('[Crawler is Resumed]');
	return this;
};

/**
 * crawler is paused or not
 */
Crawler.prototype.isPaused = function isPaused() {
	return this.q.paused;
};

/**
 * logger
 * @param <string> info: log info
 * @param <boolean> isErr: is error or not
 */
Crawler.prototype.log = function log(info, isErr) {
	var subfix = this.settings.id ? '['+this.settings.id+']' : '';
	if (!isErr) {
		console.log(util.format('%s%s', subfix, info));
	} else if (isErr == true) {
		console.error(util.format('%s%s', subfix, info));
		this.errLog = this.errLog.concat(info + '\n');
	}
	if (this.afterLog) {
		this.afterLog(info, isErr);
	}
	return this;
}

module.exports = Crawler;
