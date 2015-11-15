'use strict';

var request = require('request'),
	async = require('async'),
	events = require('events'),
	util = require('util'),
	_ = require('lodash');

var proxy = require('./proxy').proxy;

function Crawler() {
	this.tasks = [];
	this.taskCounter = 1;
	this.emitter = new events.EventEmitter();
	this.defaultOpts = {
		proxy: proxy,
		timeout: 10000
	};
}

Crawler.prototype.addTask = function (url) {
	this.tasks.push(url);
}

Crawler.prototype.addTasks = function (urls) {
	this.tasks = this.tasks.concat(urls);
}

Crawler.prototype._crawl = function (url, callback) {
	var self = this;

	var opts = _.assign(self.defaultOpts, { url: url });
	request(opts, function (e, r, body) {
		self.taskCounter++;
		if (!e && r.statusCode == 200) {
			callback(body);
		} else {
			if (e) {
				console.error(e);

			} else {
				console.error(r.statusCode);
			}
			callback();
		}
	});
}

Crawler.prototype.start = function (callback) {
	var self = this;

	if (self.tasks.length == 0) {
		console.error('Task queue has nothing!');
		if (callback) {
			callback();
		}
		return;
	}

	console.log('Crawler is starting...');

	self.emitter.on('taskHandle', function () {
		var task = self.tasks.shift();
		self.q.push(task, function (err) {
			if (err) {
				console.error(err);
				return;
			}
			if (self.tasks.length > 0) {
				self.emitter.emit('taskHandle', task);
			}
		});
	});

	self.q = async.queue(function (task, callback) {
		console.log(util.format('Current No.%s: %s', self.taskCounter, task));
		self._crawl(task, function (data) {
			self.handle(data);
			callback();
		});
	}, 1);

	self.q.drain = function () {
		console.log(util.format('Crawler has done.Total: %s.', self.taskCounter - 1));
		if (callback) {
			callback();
		}
	};

	self.emitter.emit('taskHandle');
}

module.exports = Crawler;


