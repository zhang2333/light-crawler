const util = require('util');
const path = require('path');
const fs = require('fs');

const expect = require('chai').expect;

const Crawler = require('../index');

describe('Crawler', function () {
    describe('Simple Test', function () {
        this.timeout(5000);

        it('simple', function (done) {
            let url = 'http://www.google.com';
            let c = new Crawler({ id: 'simple' });
            c.addTask(url, (result, $) => {
                expect($('title').text()).to.be.ok;
                expect(result.body).to.be.ok;
                c.log('[Successful]~~~', false, 2);
            }).start().then(done);
        });
    });
    
    describe('Settings/Props Test', function () {
        this.timeout(30000);
        let c;

        it('#timeout retry', function (done) {
            let url = 'http://www.google.com';
            c = new Crawler({
                id: '#timeout retry',
                requestOpts: { timeout: 10 }
            });
            c.addTask(url).addRule(function (result) {
                expect(result.body).to.not.exist;
            }).start().then(done);
        });

        it('#downloadTask', function (done) {
            c = new Crawler({ id: '#downloadTask', requestOpts: { timeout: 20000 } });
            let url = 'https://www.google.com/images/nav_logo242.png';
            c.addTask(url, { downloadTask: true, downloadFile: 'test.png' });
            c.start().then(() => {
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
            }).start().then(done);
        });

        it('#skipDuplicates', function (done) {
            let urls = ['http://www.baidu.com', 'http://www.baidu.com',
                'http://www.baidu.com', 'http://www.google.com'];
            c = new Crawler({ id: '#skipDuplicates', interval: 500, skipDuplicates: true });
            c.addTasks(urls).start().then(() => {
                expect(c.taskCounter).to.be.equal(3);
                done();
            });
            setTimeout(function () {
                c.addTask('http://www.baidu.com');
                c.addTasks(['http://www.baidu.com', 'http://www.sohu.com']);
            }, 1000);
        });
    });

    describe('Function Test', function () {
        this.timeout(20000);
        let c;
        
        it('#addRule()', function (done) {
            c = new Crawler({
                id: '#addRule()',
                interval: 500
            });
            c.addTask('http://www.baidu.com', { name: 'baidu' });
            c.addTask('http://www.google.com', { name: 'google' });
            let counter = 0;
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
            c.start().then(() => {
                expect(counter).to.be.equal(2);
                done();
            });
        });
        
        it('#removeRule()', function (done) {
            c = new Crawler({
                id: '#removeRule()',
                interval: 500
            });
            c.addTask('http://www.baidu.com', { name: 'baidu' });
            let counter = 0;
            c.addRule({ reg: 'www.**.com', ruleName: 'baidu', name: 'baidu' }, function (r) {
                if (r.body) {
                    counter++;
                }
            });
            c.removeRule('baidu');
            c.start().then(() => {
                expect(counter).to.be.equal(0);
                done();
            });
        });
        
        it('#loadRule()', function (done) {
            c = new Crawler({
                id: '#loadRule()'
            });
            
            c.addTask('http://www.google.com', { name: 'google' });
            
            let crawlingGoogle = {
                reg: 'www.**.com',
                name: 'google',
                scrape: function (r, $, callback) {
                    callback($('title').text());
                }
            };
            
            c.loadRule(crawlingGoogle, function (text) {
                expect(text).to.be.ok;
            });
            
            c.start().then(done);
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
            c.start().then(() => {
                expect(c.taskCounter).to.be.equal(3);
                done();
            });
            setTimeout(() => {
                c.pause();
                setTimeout(() => {
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
            let urls = [];
            for (let i = 0; i < 4; i++) {
                urls.push('http://www.baidu.com');
            }
            
            c.on('start', function () {
                c.stop();
            });
            
            c.addTasks(urls).addRule(function (r) {
                expect(r.body).to.be.ok;
            }).start().then(() => {
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
            let urls = [];
            for (let i = 0; i < 6; i++) {
                urls.push('http://www.baidu.com');
            }
            c.addTasks(urls).addRule(function (r) {
                expect(r.body).to.be.ok;
            }).start().then(() => {
                expect(c.taskCounter).to.be.equal(12);
                done();
            });
            let f = true;
            c.on('drain', function () {
                if (f) {
                    c.addTasks(urls);
                    f = false;
                }
            });
        });
    });
});
