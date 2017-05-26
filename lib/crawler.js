'use strict';

const util = require('util');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const EventEmitter = require('events').EventEmitter;

const Promise = require('bluebird');
const _ = require('lodash');
const rp = require('request-promise');
const request = require('request');
const cheerio = require('cheerio');

// Enable cancellation.
Promise.config({ cancellation: true });

const { format } = util;

class Crawler extends EventEmitter {
    constructor (opts) {
        super();

        let self = this;

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
            tasksSize: 50,
            logger: false
        };
        // options of task request
        self.requestOpts = {
            timeout: 10000
        };
        self.errLog = '';

        self.tweak(opts);

        // register listening 'pollTask', push tasks into task-pool
        self.on('pollTask', function() {
            // readyTasks =>> tasks
            if (self._tasks.length === 0 && self._readyTasks.length !== 0) {
                self._tasks = self._readyTasks.splice(0, self.settings.tasksSize);
            }

            self.p = Promise.map(self._tasks, function(task) {
                // clear last drainAwaitTimeout
                if (self._drainAwaitTimeout) {
                    clearTimeout(self._drainAwaitTimeout);
                    self._drainAwaitTimeout = null;
                }

                // if interval is an array, it will be a random value
                let interval = self.settings.interval;
                if (Array.isArray(interval)) {
                    interval = interval[0] + Math.round(Math.random() * (interval[1] - interval[0]));
                }

                return Promise.delay(Math.abs(interval)).then(function() {
                    // cache tasks
                    if (self.settings.skipDuplicates === true) {
                        self._taskCache = self._taskCache.concat(task.url + '|');
                    }

                    return self._crawl(task);
                }).then(function() {
                    self._tasks.splice(self._tasks.indexOf(task), 1);
                });
            }, { concurrency: self.settings.concurrency })
            .catch(function(e) {
                self.emit('error', e);
            })
            .finally(function() {
                if (self.paused !== true) {
                    if (self._tasks.length !== 0 || self._readyTasks.length !== 0) {
                        self.emit('pollTask');
                    } else if (self.doneCounter === self.taskCounter - self.failCounter) {
                        self._drainAwait();
                    }
                }
            });
        });
    }

    /**
     * tweak the setting of crawler
     * @param <object> opts
     */
    tweak (opts) {
        let self = this;
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
     * add tasks into task-pool
     * @param <string || array[string]> urls
     * @param <object> props : properties of task
     */
    // const addTaskWrapper = (task, ) => {

    // }

    addTask (task, prop, next) {
        let newTask = null;
        if (_.isString(task)) {
            let taskProp = prop;
            let taskNext = next;
            if (this.settings.skipDuplicates === true && new RegExp(task).test(this._taskCache)) {
                return this;
            }
            if (_.isFunction(prop)) {
                taskProp = {};
                taskNext = prop;
            }
            newTask = _.assign({ url: task }, prop);
            if (_.isFunction(taskNext)) {
                newTask.next = taskNext.bind(this);
            }
        } else if (_.isObject(task)) {
            newTask = task;
            if (_.isFunction(prop)) {
                newTask.next = prop.bind(this);
            }
        }

        newTask && this.addTasks([newTask]);

        return this;
    }

    addTasks (arr, props) {
        let self = this;

        if (self.finished || !arr) { return self; }

        let pool = self._readyTasks;
        let empty = pool.length === 0;

        if (!Array.isArray(arr)) {
            throw 'addTasks() just accept an array';
        }

        let taskProps = props || {};

        if (self.settings.skipDuplicates === true) {
            arr = _.uniq(arr);
            arr = arr.filter(function(url) {
                return !new RegExp(url).test(self._taskCache);
            });
        }
        
        for (let i = 0; i < arr.length; i++) {
            pool.push(_.isObject(arr[i]) ? arr[i] : _.assign({ url: arr[i] }, taskProps));
        }

        if (self.started === true && empty && pool.length !== 0 && self._tasks.length === 0) {
            self.emit('pollTask');
        }

        return self;
    }

    /**
     * add a rule of crawling
     * @param <string | object> reg : reg string
     * @param <function> scrape : scrape html
     */
    addRule (reg, scrape) {
        let self = this;

        let rule;
        if (_.isString(reg)) {
            rule = { reg: reg, scrape: scrape };
        } else if (_.isFunction(reg)) {
            rule = { reg: '.*', scrape: reg };
            self._rules.push(rule);
            return self;
        } else if (_.isObject(reg)) {
            if (_.has(reg, 'reg')) {
                reg.scrape = scrape;
                rule = reg;
            } else {
                throw 'rule must has reg string';
            }
        }

        self._insertRule(rule);
        return self;
    }

    // load rule
    loadRule (rule, expand) {
        let self = this;

        if (!rule.reg || !rule.scrape) {
            throw 'rule must has reg and scrape';
        }

        if (expand) {
            rule.expand = expand.bind(self);
        }

        self._insertRule(rule);
        return self;
    }

    _insertRule (rule) {
        rule.reg = rule.reg.replace(/\./g, '\\.').replace(/\*\*/g, '.*').replace(/<\.>/g, '.');
        rule.scrape = rule.scrape.bind(this);
        this._rules.push(rule);
    }

    removeRule (ruleName) {
        for (let rule of this._rules) {
            if (rule.ruleName === ruleName) {
                this._rules.splice(this._rules.indexOf(rule), 1);
                return;
            }
        }
    }

    /**
     * fetch/crawl a page for the task
     * @param <object> task
     */
    _crawl (task) {
        let self = this;

        // init options of the request
        let opts = _.assign(self.requestOpts, { url: task.url });
        if (opts.proxy == '') {
            delete opts.proxy;
        }
        if (task.requestOpts) {
            opts = _.assign(opts, task.requestOpts);
        }

        // log current
        self.log(format('[%s] No.%s: %s', task.downloadTask ? 'Downloading' : 'Crawling', self.taskCounter + 1, task.url), false, 6);

        // mark task 'is working'
        task.working = true;
        // retry times
        task.retry = 0;
        task.id = ++self.taskCounter;

        let event = new EventEmitter();

        // log error info
        function retry(info, res) {
            self.log(format('[Retry] [No.%s][%s] [%s]: %s', task.id + '', ++task.retry, info, task.url), false, 3);

            if (task.retry === self.settings.retry) {
                self.failCounter++;
                self.log(format('[Retry Failed] [No.%s][%s]%s', task.id, info, task.url), true, 1);
                res();
            }

            if (task.retry < self.settings.retry) {
                Promise.delay(self.settings.interval).then(function() {
                    event.emit('try');
                });
            } else {
                res();
            }
        }

        // match rule
        function matchRule(result) {
            Promise.delay(10).then(() => {
                process.nextTick(result => {
                    let { task, body } = result;

                    if (_.isFunction(task.next)) {
                        self.doneCounter++;
                        task.next({ task: _.omit(task, ['next']), body }, cheerio.load(body));
                    } else {
                        // match rule
                        let matchedRule = null;
                        for (let r of self._rules) {
                            if (new RegExp(r.reg).test(task.url)) {
                                let matched = _.isFunction(r.match) ? (r.match(task) || false) : false;
                                let matchAttrs = _.isMatch(task, _.omit(r, ['reg', 'scrape', 'expand', 'match', 'ruleName']));
                                if (matched || matchAttrs) {
                                    matchedRule = r;
                                    break;
                                }
                            }
                        }
                        // scraping
                        if (matchedRule) {
                            matchedRule.scrape(result, cheerio.load(body), matchedRule.expand);
                            self.doneCounter++;
                        }
                    }
                    self._drainAwait();
                }, result);
            });
        }

        // normal task
        function requestPage(res, rej) {
            opts.resolveWithFullResponse = true;
            opts.gzip = true;
            rp(opts).then(function(response) {
                if (response.statusCode === 200) {
                    let body = response.body;
                    matchRule({ task: task, body: body });
                    res();
                } else if (response.statusCode === 404) {
                    self.log(format('[404 Not Found] [No.%s] %s', task.id, task.url), false, 3);
                    res();
                } else {
                    throw { statusCode: response.statusCode };
                }
            }).catch(function(reason) {
                retry(reason.statusCode || reason, res);
            });
        }

        // download task
        function requestDownload(res, rej) {
            let file = task.downloadFile ? task.downloadFile : path.basename(task.url);
            file = path.resolve(self.settings.downloadDir, file);

            // insure dir of the file exists
            let f = true;
            let fileDir = path.dirname(file);
            let vFile = fileDir;
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
            let req = request(opts).pipe(fs.createWriteStream(file));
            req.on('error', function(e) {
                if (e) {
                    retry(e);
                }
            });
            req.on('finish', function(e) {
                matchRule({ task: task, body: 'This is a download task.' });
                res();
            });
        }

        // call beforeCrawl
        self.emit('beforeCrawl', task);

        return new Promise(function(resolve, reject) {
            event.on('try', function() {
                task.downloadTask === true ? requestDownload(resolve, reject) : requestPage(resolve, reject);
            });

            event.emit('try');
        });
    }

    _drainAwait () {
        let self = this;

        function done() {
            return self.paused !== true && self.finished !== true && self._tasks.length === 0 && self._readyTasks.length === 0;
        }

        if (done()) {
            self.log('[Task-pool is drained]', false, 3);
            // emit drain
            self.emit('drain');

            // register drainAwaitTimeout
            self._drainAwaitTimeout = setTimeout(function() {
                if (done()) {
                    self.finished = true;
                    self.log(format('[Count] \x1b[33m Total: %s. \x1b[32m Success: %s. \x1b[31m Fail: %s. \x1b[0m',
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
    start (callback) {
        let self = this;
        return new Promise((resolve, reject) => {
            // if task-pool is empty
            if (self._readyTasks.length == 0) {
                self.log('Task pool has nothing!', false, 1);
                return resolve();
            }

            self.on('finish', resolve);

            self.started = true;
            self.finished = false;

            if (self._rules.length === 0) {
                self.addRule(function() {});
            }

            self.log('[Crawler is Started]', false, 3);
            // start task-pool
            self.emit('pollTask');

            self.emit('start');
        });
    }

    /**
     * pause the Crawler
     */
    pause () {
        let self = this;

        let working = [];
        let freezed = [];

        self._tasks.forEach(function(task) {
            task.working ? working.push(task) : freezed.push(task);
        });

        self._tasks = working;
        self._freezedTasks = freezed;
        self.paused = true;
        self.p.cancel();

        self.log('[Crawler is Paused]', false, 3);
        return self;
    }

    /**
     * resume the Crawler
     */
    resume () {
        let self = this;
        self.log('[Crawler is Resumed]', false, 3);

        if (self.paused) {
            self._tasks = self._freezedTasks;
            self._freezedTasks = null;
            self.emit('pollTask');
        }

        self.paused = false;
        return self;
    }

    /**
     * crawler is paused or not
     */
    isPaused () {
        return this.paused || false;
    }

    /**
     * stop the Crawler
     */
    stop () {
        let self = this;

        self.settings.drainAwait = 0;

        self._tasks = self._tasks.filter(function(task) {
            return task.working;
        });

        return self;
    }


    uniqTasks () {
        let self = this;
        
        this.pause();
        this._freezedTasks = _.uniqWith(this._freezedTasks, _.isEqual);
        this.resume();
        
        return this;
    }

    /**
     * logger
     * @param <string> info: log info
     * @param <boolean> isErr: is error or not
     * @param <int> type: color id
     */
    log (info, isErr, type) {
        if (!this.settings.logger) return;
        
        let subfix = this.settings.id ? '[' + this.settings.id + ']' : '';

        let printInfo = info;
        if (type > 0) {
            printInfo = info.replace(/(\[[^\]]+\])/, '\x1b[3' + type + 'm$1\x1b[0m');
        }

        if (!isErr) {
            console.log(format('%s%s', subfix, printInfo));
        } else if (isErr == true) {
            console.log(format('%s%s', subfix, '\x1b[31m' + info + '\x1b[0m'));
            this.errLog = this.errLog.concat(info + '\n');
        }
        this.emit('afterLog', info, isErr, type);
        return this;
    }
}



module.exports = Crawler;
