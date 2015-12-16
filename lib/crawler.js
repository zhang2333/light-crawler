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
		drainAwait: 0
	};
	// options of task request
	self.requestOpts = {
		timeout: 10000
	};
	self.errLog = '';

	self.tweak(opts);
	
	Promise.config({
		// Enable cancellation.
		cancellation: true
	});
	
	// register listening 'pollTask', push tasks into task-pool
	self.on('pollTask', function () {
		self.p = Promise.map(self._tasks, function (task) {
			// clear last timeout
			if (self._drainAwaitFunction) {
				clearTimeout(self._drainAwaitFunction);
				self._drainAwaitFunction = null;
			}
			
			// log current
			self.log(util.format('Crawling No.%s: %s', self.taskCounter + 1, task.url));
			
			// mark task 'is working'
			task.working = true;
			
			if (self.settings.skipRepetitiveTask) {
				self._taskCache = self._taskCache.concat(task.url + '|');
			}
			
			return self._crawl(task).delay(self.settings.interval).then(function () {
				self._tasks.splice(self._tasks.indexOf(task), 1);
			});
		}, { concurrency: self.settings.concurrency })
		.catch(function (e) {
			if (e) {
				self.log(e, true);
			}
		})
		.finally(function (){
			if (self.paused !== true) {
				if (self._tasks.length !== 0) {
					self.emit('pollTask');
				} else {
					self.log(util.format('[Task-pool is drained] Total: %s.Success: %s.Fail: %s.',
						self.taskCounter, self.taskCounter - self.failCounter, self.failCounter));
					if (self.finished !== true) {
						self.emit('drainAwait');
					}
				}
			}
		});
	});
	
	// on finish
	self.on('drainAwait', function () {
		// register drain await
		self._drainAwaitFunction = setTimeout(function() {
			if (self._tasks.length == 0 && self.paused !== true && self.finished !== true) {
				self.finished = true;
				self.log('[Crawler is finished]');
				if (self.errLog.length > 0) {
					console.log(self.errLog);
				}
				if (self.onFinished) {
					process.nextTick(function () {
						self.onFinished();
					});
				}
			}
		}, self.settings.drainAwait);
	});
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
	
	var event = new EventEmitter();
	
	// normal task
	var requestPage = function requestPage(res, rej) {
		rp(opts).then(function (html) {
			var flag = false;
			// match rule
			for (var r in self._rules) {
				if (new RegExp(r).test(task.url)) {
					flag = true;
					process.nextTick(function (task, html) {
						// excute rule
						self._rules[r]({ task: task, body: html });
						
						if (self._tasks.length === 0 && self.paused !== true && self.finished !== true) {
							self.emit('drainAwait');
						}
					}, task, html);
					break;
				}
			}
			
			// no matched
			if (!flag) {
				if (Object.keys(self._rules).length != 0) {
					self.log(util.format('[No Rule Matched][No.%s]%s\n', task.id, task.url), true);
				}
			}
			
			res();
		}).catch(function (reason) {
			logError(reason.statusCode ? reason.statusCode : reason.cause);
			(task.retry < self.settings.retry) ? event.emit('try') : res();
		});
	};
	
	// download task
	var requestDownload = function requestDownload(res, rej) {
		var file = task.downloadFile ? task.downloadFile : path.basename(task.url);
		file = path.resolve(self.settings.downloadDir, file);
		
		// insure file's dir exists
		var f = true;
		var fileDir = path.dirname(file);
		var vFile = fileDir;
		while (f) {
			try {
				fs.mkdirSync(vFile);
				vFile = fileDir;
			} catch (err) {
				if (err.code == 'EEXIST') {
					if (vFile == fileDir) {
						f = false;
					}
				} else if (err.code == 'ENOENT') {
					vFile = path.dirname(vFile);
				} else {
					f = false;
					logError(err);
					rej(err);
				}
			}
		}
		
		// download the file
		var req = request(opts).pipe(fs.createWriteStream(file));
		req.on('finish', function (e) {
			if (e) {
				logError(e);
				(task.retry < self.settings.retry) ? event.emit('try') : res();
			} else {
				res({ task: task, body: 'This is a download task.' });
			}
		});
	};
	
	return new Promise(function (resolve, reject) {
		event.on('try', function () {
			if (!task.downloadTask) {
				requestPage(resolve, reject);
			} else {
				requestDownload(resolve, reject);
			}
		});
			
		event.emit('try');
	});

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
	var self = this;
	
	var working = [];
	var freezed = [];
	
	self._tasks.forEach(function (task) {
		task.working ? working.push(task) : freezed.push(task);
	});
	
	self._tasks = working;
	self._freezedTasks = freezed;
	self.paused = true;
	self.p.cancel();
	
	self.log('[Crawler is Paused]');
	return self;
};

/**
 * resume the Crawler
 */
Crawler.prototype.resume = function resume() {
	var self = this;
	self.log('[Crawler is Resumed]');
	
	if (self.paused) {
		self._tasks = self._freezedTasks;
		self._freezedTasks = null;
		self.emit('pollTask');
	}
	
	self.paused = false;
	return self;
};

/**
 * crawler is paused or not
 */
Crawler.prototype.isPaused = function isPaused() {
	return this.paused || false;
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
