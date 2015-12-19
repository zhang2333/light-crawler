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
    self.doneCounter = 0;
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
            // clear last drain await
            if (self._drainAwaitFunction) {
                clearTimeout(self._drainAwaitFunction);
                self._drainAwaitFunction = null;
            }
            
            // if interval is an array, it will be random value
            var interval = self.settings.interval;
            if (Array.isArray(interval)) {
                interval = interval[0] + Math.round(Math.random() * (interval[1] - interval[0]));
            }

            return Promise.delay(Math.abs(interval)).then(function () {
                // cache tasks
                if (self.settings.skipRepetitiveTask) {
                    self._taskCache = self._taskCache.concat(task.url + '|');
                }

                return self._crawl(task);
            }).then(function () {
                self._tasks.splice(self._tasks.indexOf(task), 1);
            });
        }, { concurrency: self.settings.concurrency })
            .catch(function (e) {
                if (e) {
                    self.log(e, true);
                }
            })
            .finally(function () {
                if (self.paused !== true) {
                    if (self._tasks.length !== 0) {
                        self.emit('pollTask');
                    } else if (self.finished !== true && self.doneCounter === self.taskCounter - self.failCounter) {
                        self.emit('drainAwait');
                    }
                }
            });
    });
	
    // on finish
    self.on('drainAwait', function () {
        self.log('[Task-pool is drained]', false, 3);
        // register drain await
        self._drainAwaitFunction = setTimeout(function () {
            if (self._tasks.length == 0 && self.paused !== true && self.finished !== true) {
                self.finished = true;
                self.log(util.format('[Count] \x1b[33m Total: %s. \x1b[32m Success: %s. \x1b[31m Fail: %s. \x1b[0m',
                    self.taskCounter, self.taskCounter - self.failCounter, self.failCounter), false, 3);
                self.log('[Crawler is finished]', false, 3);
                if (self.errLog.length > 0) {
                    self.log('[Error Log]', false, 1);
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

    var empty = self._tasks.length === 0;

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

    if (self.started === true && empty && self._tasks.length !== 0) {
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
 */
Crawler.prototype._crawl = function _crawl(task) {
    var self = this;

    // init options of the request
    var opts = _.assign(self.requestOpts, { url: task.url });
    if (opts.proxy == '') {
        delete opts.proxy;
    }
    if (task.requestOpts) {
        opts = _.assign(opts, task.requestOpts);
    }
	
    // log current
    self.log(util.format('[%s] No.%s: %s', task.downloadTask ? 'Downloading' : 'Crawling', self.taskCounter + 1, task.url), false, 6);
	
    // mark task 'is working'
    task.working = true;
    // retry times
    task.retry = 0;
    task.id = ++self.taskCounter;
	
    // log error info
    var logError = function logError(info) {
        self.log(util.format('[Retry] [%s][%s]: %s', info, ++task.retry, task.url), false, 3);
        if (task.retry == self.settings.retry) {
            self.failCounter++;
            self.log(util.format('[Retry Failed] [No.%s][%s]%s', task.id, info, task.url), true, 1);
        }
    }
	
    // match rule
    var matchRule = function matchRule(result) {
        var flag = false;
        // match rule
        for (var r in self._rules) {
            if (new RegExp(r).test(task.url)) {
                flag = true;
                Promise.delay(10).then(function () {
                    process.nextTick(function (result) {
                        // excute rule
                        self._rules[r](result);
                        self.doneCounter++;
                        if (self._tasks.length === 0 && self.paused !== true && self.finished !== true) {
                            self.emit('drainAwait');
                        }
                    }, result);
                });
                break;
            }
        }
		
        // not matched
        if (!flag && !result.task.downloadTask) {
            if (Object.keys(self._rules).length != 0) {
                self.log(util.format('[No Rule Matched] [No.%s]%s\n', task.id, task.url), true, 1);
            }
        }
    };

    var event = new EventEmitter();
	
    // normal task
    var requestPage = function requestPage(res, rej) {
        rp(opts).then(function (html) {
            matchRule({ task: task, body: html });
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
                matchRule({ task: task, body: 'This is a download task.' });
                res();
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
        self.log('Task pool has nothing!', false, 1);
        if (callback) {
            return callback();
        }
        return;
    }

    if (callback) {
        self.onFinished = callback;
    }

    self.started = true;
    self.finished = false;

    self.log('[Crawler is Started]', false, 3);

    if (Object.keys(self._rules).length == 0) {
        self._rules['.*'] = function (r) { };
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

    self.log('[Crawler is Paused]', false, 3);
    return self;
};

/**
 * resume the Crawler
 */
Crawler.prototype.resume = function resume() {
    var self = this;
    self.log('[Crawler is Resumed]', false, 3);

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
Crawler.prototype.log = function log(info, isErr, type) {
    var subfix = this.settings.id ? '[' + this.settings.id + ']' : '';

    var printInfo = info;
    if (type > 0) {
        printInfo = info.replace(/(\[[^\]]+\])/, '\x1b[3' + type + 'm$1\x1b[0m');
    }

    if (!isErr) {
        console.log(util.format('%s%s', subfix, printInfo));
    } else if (isErr == true) {
        console.log(util.format('%s%s', subfix, '\x1b[31m' + info + '\x1b[0m'));
        this.errLog = this.errLog.concat(info + '\n');
    }
    if (this.afterLog) {
        this.afterLog(info, isErr);
    }
    return this;
}

module.exports = Crawler;
