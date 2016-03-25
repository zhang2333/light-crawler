'use strict';

var util = require('util'),
    path = require('path'),
    fs = require('fs');

var expect = require('chai').expect;

var Crawler = require('../index');

describe('Crawler', function () {
    describe('Simple Test', function () {
        this.timeout(5000);
        
        it('simple', function (done) {
            var url = 'http://www.google.com';
            var c = new Crawler({ id: 'simple' });
            c.addTasks(url).addRule(function (result, $) {
                expect($('title').text()).to.be.ok;
                expect(result.body).to.be.ok;
                c.log('[Successful]~~~', false, 2);
            }).start(function () {
                done();
            });
        });
    });
    
    describe('Settings/Props Test', function () {
        this.timeout(30000);
        var c;

        it('#timeout retry', function (done) {
            var url = 'http://www.google.com';
            c = new Crawler({
                id: '#timeout retry',
                requestOpts: { timeout: 10 }
            });
            c.addTasks(url).addRule(function (result) {
                expect(result.body).to.not.exist;
            }).start(function () {
                done();
            });
        });

        it('#downloadTask', function (done) {
            c = new Crawler({ id: '#downloadTask', requestOpts: { timeout: 20000 } });
            var url = 'https://www.google.com/images/nav_logo242.png';
            c.addTasks(url, { downloadTask: true, downloadFile: 'test.png' });
            c.start(function () {
                fs.unlinkSync(path.resolve(c.settings.downloadDir, 'test.png'));
                done();
            });
        });
        
        it('#interval concurrency', function (done) {
            c = new Crawler({ id: '#interval concurrency', interval: [200, 700], concurrency: 2 });
            c.addTasks(['http://www.baidu.com', 'http://www.google.com'], { type: 'SE' });
            c.addTasks(['http://www.sohu.com', 'http://www.qq.com'], { type: 'Other' });
            c.addRule(function (result) {
                expect(result.body).to.be.ok;
                c.log('[Parsed]' + result.task.url, false, 4);
                if (result.task.id <= 2) {
                    expect(result.task.type).to.be.equal('SE');
                } else {
                    expect(result.task.type).to.be.equal('Other');
                }
            }).start(function () {
                done();
            });
        });

        it('#skipDuplicates', function (done) {
            var urls = ['http://www.baidu.com', 'http://www.baidu.com',
                'http://www.baidu.com', 'http://www.google.com'];
            c = new Crawler({ id: '#skipDuplicates', interval: 500, skipDuplicates: true });
            c.addTasks(urls).addRule(function (result) { }).start(function () {
                expect(c.taskCounter).to.be.equal(3);
                done();
            });
            setTimeout(function () {
                c.addTasks('http://www.baidu.com');
                c.addTasks(['http://www.baidu.com', 'http://www.sohu.com']);
            }, 1000);
        });
    });

    describe('Function Test', function () {
        this.timeout(20000);
        var c;
        
        it('#addRule()', function (done) {
            c = new Crawler({
                id: '#addRule()',
                interval: 500
            });
            c.addTasks('http://www.baidu.com', { name: 'baidu' });
            c.addTasks('http://www.google.com', { name: 'google' });
            var counter = 0;
            c.addRule({ reg: 'www.**.com', name: 'baidu' }, function (r) {
                if (r.body) {
                    counter++;
                }
            });
            c.addRule({ reg: 'www.**.com', name: 'google' }, function (r) {
                if (r.body) {
                    counter++;
                }
            });
            c.start(function () {
                expect(counter).to.be.equal(2);
                done();
            });
        });
        
        it('#removeRule()', function (done) {
            c = new Crawler({
                id: '#removeRule()',
                interval: 500
            });
            c.addTasks('http://www.baidu.com', { name: 'baidu' });
            var counter = 0;
            c.addRule({ reg: 'www.**.com', ruleName: 'baidu', name: 'baidu' }, function (r) {
                if (r.body) {
                    counter++;
                }
            });
            c.removeRule('baidu');
            c.start(function () {
                expect(counter).to.be.equal(0);
                done();
            });
        });
        
        it('#loadRule()', function (done) {
            c = new Crawler({
                id: '#loadRule()'
            });
            
            c.addTasks('http://www.google.com', { name: 'google' });
            
            var crawlingGoogle = {
                reg: 'www.**.com',
                name: 'google',
                scrape: function (r, $, callback) {
                    callback($('title').text());
                }
            };
            
            c.loadRule(crawlingGoogle, function (text) {
                expect(text).to.be.ok;
            });
            
            c.start(function () {
                done();
            });
        });
        
        it('#pause/resume()', function (done) {
            c = new Crawler({
                id: '#pause/resume()',
                interval: 500
            });
            c.addTasks(['http://www.baidu.com', 'http://www.google.com', 'http://www.qq.com']);
            c.addRule(function (r) {
                expect(r.body).to.be.ok;
            });
            c.start(function () {
                expect(c.taskCounter).to.be.equal(3);
                done();
            });
            setTimeout(function () {
                c.pause();
                setTimeout(function () {
                    expect(c.isPaused()).to.be.true;
                    c.resume();
                }, 1000);
            }, 700);
        });
        
        it('#stop()', function (done) {
            c = new Crawler({
                id: '#stop()',
                interval: 100,
                concurrency: 2
            });
            var urls = [];
            for (var i = 0; i < 4; i++) {
                urls.push('http://www.baidu.com');
            }
            
            c.on('start', function () {
                c.stop();
            });
            
            c.addTasks(urls).addRule(function (r) {
                expect(r.body).to.be.ok;
            }).start(function () {
                expect(c.taskCounter).to.be.equal(2);
                done();
            });
        });

        it('#drainAwait()', function (done) {
            c = new Crawler({
                id: '#drainAwait()',
                interval: 100,
                tasksSize: 2
            });
            var urls = [];
            for (var i = 0; i < 6; i++) {
                urls.push('http://www.baidu.com');
            }
            c.addTasks(urls).addRule(function (r) {
                expect(r.body).to.be.ok;
            }).start(function () {
                expect(c.taskCounter).to.be.equal(12);
                done();
            });
            var f = true;
            c.on('drain', function () {
                if (f) {
                    c.addTasks(urls);
                    f = false;
                }
            });
        });
    });
});
