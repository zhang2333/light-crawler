'use strict';

var util = require('util'),
    path = require('path'),
    fs = require('fs'),
    zlib = require('zlib'),
    EventEmitter = require('events').EventEmitter;

var Promise = require('bluebird'),
    _ = require('lodash'),
    rp = require('request-promise'),
    request = require('request');

// Enable cancellation.
Promise.config({ cancellation: true });

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
    self._rules = [];
    self._taskCache = '';
    self._readyTasks = [];
    self._freezedTasks = [];

    // public props
    self.taskCounter = 0;
    self.failCounter = 0;
    self.doneCounter = 0;
    self.settings = {
        interval: 0,
        retry: 3,
        concurrency: 1,
        skipDuplicates: false,
        downloadDir: path.dirname(__dirname),
        drainAwait: 0,
        tasksSize: 50
    };
    // options of task request
    self.requestOpts = {
        timeout: 10000
    };
    self.errLog = '';

    self.tweak(opts);
    
    // register listening 'pollTask', push tasks into task-pool
    self.on('pollTask', function () {
        // readyTasks =>> tasks
        if (self._tasks.length === 0 && self._readyTasks.length !== 0) {
            self._tasks = self._readyTasks.splice(0, self.settings.tasksSize);
        }

        self.p = Promise.map(self._tasks, function (task) {
            // clear last drain await
            if (self._drainAwaitTimeout) {
                clearTimeout(self._drainAwaitTimeout);
                self._drainAwaitTimeout = null;
            }
            
            // if interval is an array, it will be random value
            var interval = self.settings.interval;
            if (Array.isArray(interval)) {
                interval = interval[0] + Math.round(Math.random() * (interval[1] - interval[0]));
            }

            return Promise.delay(Math.abs(interval)).then(function () {
                // cache tasks
                if (self.settings.skipDuplicates === true) {
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
                    if (self._tasks.length !== 0 || self._readyTasks.length !== 0) {
                        self.emit('pollTask');
                    } else if (self.doneCounter === self.taskCounter - self.failCounter) {
                        self._drainAwait();
                    }
                }
            });
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

    var pool = self._readyTasks;
    var empty = pool.length === 0;
    var taskProps = props ? props : {};

    if (Array.isArray(taskUrls)) {
        if (self.settings.skipDuplicates === true) {
            taskUrls = _.uniq(taskUrls);
            taskUrls = taskUrls.filter(function (url) {
                return !new RegExp(url).test(self._taskCache);
            });
        }
        for (var i = 0; i < taskUrls.length; i++) {
            pool.push(_.assign({ url: taskUrls[i] }, taskProps));
        }
    } else if (_.isString(taskUrls)) {
        if (self.settings.skipDuplicates === true && new RegExp(taskUrls).test(self._taskCache)) {
            return self;
        }
        pool.push(_.assign({ url: taskUrls }, taskProps));
    }

    if (self.started === true && empty && pool.length !== 0 && self._tasks.length === 0) {
        self.emit('pollTask');
    }

    return self;
}

/**
 * add crawl's rule
 * @param <string | object> reg : reg string
 * @param <function> scrape : scrape html
 */
Crawler.prototype.addRule = function addRule(reg, scrape) {
    var self = this;

    var rule;
    if (_.isString(reg)) {
        reg = reg.replace(/\./g, '\\.').replace(/\*\*/g, '.*');
        rule = { reg: reg, scrape: scrape };
    } else if (_.isFunction(reg)) {
        rule = { reg: '.*', scrape: reg };
    } else if (_.isObject(reg)) {
        if (_.has(reg, 'reg')) {
            reg.reg = reg.reg.replace(/\./g, '\\.').replace(/\*\*/g, '.*');
            reg.scrape = scrape;
            rule = reg;
        } else {
            throw 'rule must has reg string';
        }
    }

    self._rules.push(rule);

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
    
    var event = new EventEmitter();
	
    // log error info
    function retry(info, res) {
        self.log(util.format('[Retry] [No.%s][%s] [%s]: %s', task.id + '', ++task.retry, info, task.url), false, 3);
        
        if (task.retry === self.settings.retry) {
            self.failCounter++;
            self.log(util.format('[Retry Failed] [No.%s][%s]%s', task.id, info, task.url), true, 1);
            res();
        }

        if (task.retry < self.settings.retry) {
            Promise.delay(self.settings.interval).then(function () {
                event.emit('try');
            });
        } else {
            res();
        }
    }
	
    // match rule
    function matchRule(result) {
        // match rule
        for (var r of self._rules) {
            if (new RegExp(r.reg).test(task.url) && _.isMatch(task, _.omit(r, ['reg', 'scrape']))) {
                Promise.delay(10).then(function () {
                    process.nextTick(function (result) {
                        // excute rule
                        r.scrape(result);

                        self.doneCounter++;
                        self._drainAwait();
                    }, result);
                });
                break;
            }
        }
    };
	
    // normal task
    function requestPage(res, rej) {
        opts.resolveWithFullResponse = true;
        opts.gzip = true;
        rp(opts).then(function (response) {
            if (response.statusCode === 200) {
                var body = response.body;
                matchRule({ task: task, body: body });
                res();
            } else if (response.statusCode === 404) {
                self.log(util.format('[404 Not Found] [No.%s] %s', task.id, task.url), false, 3);
                res();
            } else {
                throw { statusCode: response.statusCode };
            }
        }).catch(function (reason) {
            retry(reason.statusCode ? reason.statusCode : reason, res);
        });
    };
	
    // download task
    function requestDownload(res, rej) {
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
                    retry(err, res);
                    rej(err);
                }
            }
        }
		
        // download the file
        var req = request(opts).pipe(fs.createWriteStream(file));
        req.on('error', function (e) {
            if (e) {
                retry(e);
            }
        });
        req.on('finish', function (e) {
            matchRule({ task: task, body: 'This is a download task.' });
            res();
        });
    };
    
    // call beforeCrawl
    self.emit('beforeCrawl', task);

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

Crawler.prototype._drainAwait = function _drainAwait() {
    var self = this;
    if (self.paused !== true && self.finished !== true && self._tasks.length === 0 && self._readyTasks.length === 0) {
        self.log('[Task-pool is drained]', false, 3);
        // emit drain
        self.emit('drain');
        
        // register drainAwaitTimeout
        self._drainAwaitTimeout = setTimeout(function () {
            if (self.paused !== true && self.finished !== true && self._tasks.length === 0 && self._readyTasks.length === 0) {
                self.finished = true;
                self.log(util.format('[Count] \x1b[33m Total: %s. \x1b[32m Success: %s. \x1b[31m Fail: %s. \x1b[0m',
                    self.taskCounter, self.taskCounter - self.failCounter, self.failCounter), false, 3);
                self.log('[Crawler is finished]', false, 3);
                if (self.errLog.length > 0) {
                    self.log('[Error Log]', false, 1);
                    self.log(self.errLog, false);
                }
                self.emit('finish');
            }
        }, self.settings.drainAwait);
    }
}

/**
 * start the Crawler
 * @param <function> callback: onFinished
 */
Crawler.prototype.start = function start(callback) {
    var self = this;

    // empty task-pool
    if (self._readyTasks.length == 0) {
        self.log('Task pool has nothing!', false, 1);
        if (callback) {
            return callback();
        }
        return;
    }

    self.on('finish', function () {
        if (callback) {
            process.nextTick(function () {
                callback();
            });
        }
    });

    self.started = true;
    self.finished = false;

    if (self._rules.length === 0) {
        self.addRule(function () { });
    }

    self.log('[Crawler is Started]', false, 3);
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
    this.emit('afterLog', info, isErr, type);
    return this;
}

module.exports = Crawler;
