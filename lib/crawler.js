'use strict';

var util = require('util'),
	path = require('path'),
	fs = require('fs'),
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
	self.id;
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
		// clear last timeout
		if (self._finishTimeoutFunction) {
			clearTimeout(self._finishTimeoutFunction);
			self._finishTimeoutFunction = null;
		}
		
		var crawl = function crawl() {
			// cache task
			if (self.settings.skipRepetitiveTask) {
				self._taskCache = self._taskCache.concat(task.url + '|');
			}
			
			// log current
			self.log(util.format('Crawling No.%s: %s', self.taskCounter + 1, task.url));
			
			// call _crawl
			self._crawl(task, function (result) {
				// match rule
				var flag = false;
				Object.keys(self._rules).forEach(function (rule) {
					if (flag) { return; }
					if (new RegExp(rule).test(result.task.url)) {
						try {
							// avoid i/o operation
							process.nextTick(function (r) {
								// excute rule
								self._rules[rule](r);
								
								// finish the crawler
								if (self._tasks.length == 0) {
									// register timeout
									self._finishTimeoutFunction = setTimeout(function() {
										if (self._tasks.length == 0 && self.drained) {
											self.finished = true;
											self.log('[Crawler is finished]');
											process.nextTick(function () {
												self.onFinished();
											});
										}
									}, self.settings.finishTimeout);
								}
							}, result);
						} catch (err) {
							self.log(util.format('[Processing Error][No.%s]%s\n[%s]\n',
								result.task.id, result.task.url, err), true);
						} finally {
							flag = true;
							done();
						}
					}
				});
				// no matched
				if (!flag) {
					if (Object.keys(self._rules).length != 0) {
						self.log(util.format('[No Rule Matched][No.%s]%s\n', result.task.id, result.task.url), true);
					}
					done();
				}
			});
		};
		
		// deferred execution for crawl's interval
		if (self.settings.interval != 0 && self.taskCounter != 0) {
			setTimeout(crawl, self.settings.interval);
		} else {
			crawl();
		}
	}, self.settings.concurrency);

	// drain task-pool
	self.q.drain = function () {
		self.drained = true;
		self.log(util.format('[Task-pool is drained] Total: %s.Success: %s.Fail: %s.',
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
		if (opts.id) {
			self.id = opts.id;
			delete opts.id;
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

	// normal task: crawling html
	var normal = function normal(cb) {
		request(opts, function (e, r, body) {
			if (!e && r.statusCode == 200) {
				cb(null, { task: task, body: body });
			} else {
				var info = e ? e.code : r.statusCode;
				logError(info);
				cb(info);
			}
		});
	};

	// download task
	var download = function download(cb) {
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
					cb(err);
				}
			}
		}
		
		// download the file
		var req = request(opts).pipe(fs.createWriteStream(file));
		req.on('finish', function (e) {
			if (e) {
				logError(e);
				cb(e);
			} else {
				cb(null, { task: task, body: 'This is a download task.' });
			}
		});
	};

	// download task or not
	var func = task.downloadTask == true ? download : normal;

	// retry this task if errors occured
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
}

/**
 * pause the Crawler
 */
Crawler.prototype.pause = function pause() {
	this.q.pause();
	this.log('[Crawler is Paused]');
};

/**
 * resume the Crawler
 */
Crawler.prototype.resume = function resume() {
	this.q.resume();
	this.log('[Crawler is Resumed]');
};

/**
 * crawler is paused or not
 */
Crawler.prototype.isPaused = function isPaused() {
	return this.q.paused;
};

/**
 * logger
 */
Crawler.prototype.log = function log(info, isErr) {
	var subfix = this.id ? '['+this.id+']' : '';
	if (!isErr) {
		console.log(util.format('%s%s', subfix, info));
	} else if (isErr == true) {
		console.error(util.format('%s%s', subfix, info));
		this.errLog = this.errLog.concat(info + '\n');
	}
	if (this.afterLog) {
		this.afterLog(info, isErr);
	}
}

module.exports = Crawler;
