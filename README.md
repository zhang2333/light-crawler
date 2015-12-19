## Light Crawler - Simplified Crawler

[![Build Status](https://travis-ci.org/zhang2333/light-crawler.svg)](https://travis-ci.org/zhang2333/light-crawler)

English Doc(Here) or [中文文档](https://github.com/zhang2333/light-crawler/blob/master/README_zh_CN.md).

### Install

```shell
npm install light-crawler
```

### Simple Example

```javascript
var Crawler = require('light-crawler');
// create a Crawler instance
var c = new Crawler();
// add a url or array of url for crawling
c.addTasks('http://www.xxx.com');
// define a crawling rule and processing funciton
c.addRule(function (result) {
	// result has 2 props : task and body
	// result.task's props : id, url, others you added.
	// result.body is the HTML of the crawling page
	process result.body... // you can use cheerio
})
// start your crawler
c.start(function () {
	console.log('Finished!');
});
```
### Crawler Property

In light-crawler,crawling page is called `task`.Task will be put into task-pool and be executed in order.

* `settings`: crawler's basic settings
 * `id`: crawler's id,integer or string，defalut: `null`
 * `interval`: crawling interval，defalut: `0`(ms).or a random value in a range e.g.`[200,500]`
 * `retry`: retry times，defalut:`3`
 * `concurrency`: an integer for determining how many tasks should be run in parallel，defalut: `1`
 * `skipRepetitiveTask`: whether delete the repetitive task(same url)，defalut: `false`

* `requestOpts`: settings of tasks，**every task is processed with these settings**
 * `timeout`: defalut: `10000`
 * `proxy`: proxy address
 * `headers`: headers of request，defalut: `{}`
 * or other settings in [request opts][request-opts]

* `taskCounter`: count all finished tasks whether they are failed or not
* `failCounter`: count all failed tasks
* `started`
* `finished`
* `errLog`: log all error infos in crawling
* `downloadDir`: downloaded files in here, default: `../__dirname`
* `drainAwait`: crawler will be finished when task-pool is drained.This prop will let crawler await adding tasks when task-pool is drained.default:`0`(ms)
* `tasksSize`: size of task-pool, exceeding tasks is in the buffer of task-pool, default:`50`

### Crawler API

* `Crawler(opts: object)`

 construtor of `Crawler`
 
```javascript
// e.g.：
var c = new Crawler({
	interval: 1000,
	retry: 5,
	.... // other props of `crawler.settings`
	requestOpts: {
		timeout: 5000,
		proxy: http://xxx,
		.... // other props of `crawler.requestOpts`
	}
});
```
* `tweak(opts: object)`

 like foregoing
* `addTasks(urls: string or array[, props: obejct])`

 add task into task-pool

```javascript
// e.g.：
c.addTasks('http://www.google.com');
// or an array
c.addTasks(['http://www.google.com','http://www.yahoo.com']);

// add props for a task
c.addTasks('http://www.google.com', { disc: 'google' });
// add same props for tasks
c.addTasks(['http://www.google.com','http://www.yahoo.com'], { type: 'search engine' });
// get these props in processing function
..function (result) {
	if (result.task.type == 'search engine') {
		console.log(result.task.url + ' is a S.E. site.');
		...
	}
	...
}...
```
* `addRule(reg: string, func: function)`

 configure a rule for crawling

```javascript
// e.g.：
var tasks = [
	'http://www.google.com/123', 
	'http://www.google.com/2546', 
	'http://www.google.com/info/foo',
	'http://www.google.com/info/123abc'
];
c.addTasks(tasks);
c.addRule('http://www.google.com/[0-9]*', function (result) {
	// match to tasks[0] and tasks[1]
	// process result.body
});
c.addRule('http://www.google.com/info/**', function (result) {
	// match to tasks[2] and tasks[3]
	// process result.body
});
// or you can not define the rule
c.addRule(function (result) {
	// match to all url in tasks
	// process result.body
});
```
> Tip: light-crawler will transform all `.` in rule string.So you can directly write `www.a.com`,instead of `www\\.a\\.com`.If you need `.*`,you can use `**`, just like upper example.

* `start(onFinished: function)`

 start the crawler
```javascript
// e.g.：
c.start(function () {
	// on finished
	console.log('done！');
});
```

* `pause()`

 pause the crawler

* `resume()`

 resume the crawler

* `isPaused()`

 the crawler is is paused or not

* `log(info: string, isErr: boolean, type: int)`

 crawler's logger

```javascript
// e.g.：
// if it's an error,c.errLog will append it
c.log('some problems', true);
// console print: 
// [c.settings.id if it has]some problems

// type is color code of first '[...]', e.g.'[Crawler is Finished]'
// 1 red,2 green,3 yellow,4 blue,5 magenta,6 cyan...so on
c.log('[Parsed]blahblah~', false, 4);
// console print: 
// [c.settings.id if it has][Parsed]([Parsed] wil be blue)blahblah~

// you can do something after log() everytime
c.afterLog = function (info, isErr) {
	fs.appendFileSync('c.log', info); // append info to c.log
	....
};

// even you can replace the log()
c.log = function (info, isErr, type) {
	process info....
};
```

### Download Files
just add `downloadTask: true` for task you need to download
```javascript
// e.g.：
// specify download directory
c.tweak({ downloadDir: 'D:\\yyy' });

var file = 'http://xxx/abc.jpg';
// 'abc.jpg' will be downloaded into 'D:\\yyy'
c.addTasks(file, {downloadTask: true});
// or you can specify its name
c.addTasks(file, {downloadTask: true, downloadFile: 'mine.jpg'});
// or specify relative dir(to 'D:\\yyy')
// if this directory ('jpg') doesn't exist,crawler will create it
c.addTasks(file, {downloadTask: true, downloadFile: 'jpg/mine.jpg'});
// or specify absolute dir
c.addTasks(file, {downloadTask: true, downloadFile: 'C:\\pics\\mine.jpg'});
```

### Events

* `beforeCrawl(task)`

 task's props: `id`,`url`,`retry`,`working`,`requestOpts`,`downloadTask`,`downloadFile`...so on
```js
// e.g.
c.beforeCrawl = funciton (task) {
    console.log(task);
}
```

* `onDrained()`

 when task-pool and its buffer are drained
```js
// e.g.
c.onDrained = funciton () {
    // do something
}
```

### Utils API

* `getLinks(html: string)`

 get all links in the element

```js
// e.g.：
var html = `
  <div>
	<ul>
	  <li>
		<a href="1">1</a>
		<a href="2">2</a>
		<a href="3">3</a>
	  </li>
	  <li><a href="4">4</a></li>
	  <li></li>
	</ul>
  </div>
`);
var links = Crawler.getLinks(html);
console.log(links);
// ['1', '2', '3', '4']

// you can also use cheerio
var $ = cheerio.load(html);
var links = Crawler.getLinks($('ul'));
```

* `loadHeaders(file: string)`

 load request headers from file
`example.headers`
```
Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8
Accept-Encoding:gzip, deflate, sdch
Accept-Language:zh-CN,zh;q=0.8,en;q=0.6
Cache-Control:max-age=0
Connection:keep-alive
Cookie:csrftoken=Wwb44iw
Host:abc
Upgrade-Insecure-Requests:1
User-Agent:Mozilla/5.0 (Windows NT 6.1; WOW64)
...
```
load this file and set headers for request
```js
var headers = Crawler.loadHeaders('example.headers');
c.tweak({
	requestOpts: {
		headers: headers
	}
});
```

[request-opts]: https://github.com/request/request#requestoptions-callback
