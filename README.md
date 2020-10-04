## Light Crawler - Directed Crawler

[![Build Status](https://travis-ci.org/zhang2333/light-crawler.svg)](https://travis-ci.org/zhang2333/light-crawler)

[![NPM Status](https://nodei.co/npm/light-crawler.png?downloads=true&downloadRank=true)](https://nodei.co/npm/light-crawler/)

[![NPM Downloads](https://nodei.co/npm-dl/light-crawler.png)](https://nodei.co/npm/light-crawler/)

A simplified directed web crawler, easy for scraping web pages and downloading other resources.

English Doc(Here) or [中文文档](https://github.com/zhang2333/light-crawler/blob/master/README_zh_CN.md).

### Installation

```shell
npm install light-crawler
```

### Example

```javascript
const Crawler = require('light-crawler');
// create a instance of Crawler
let c = new Crawler();
// add a url or an array to request
c.addTask('http://www.xxx.com');
// define a scraping rule
c.addRule(function (result) {
	// result has 2 props : task and body
	// result.task: id, url, others you added.
	// result.body is the HTML of the page
	// scrape result.body, you can use cheerio
})
// start your crawler now
c.start().then(() => {
	console.log('Finished!');
});
```
### Crawler Properties

In light-crawler,requesting page is called `task`.Tasks will be put into task-pool and be executed in order.

- `settings`: basic settings of crawler
  - `id`: id of the crawler,integer or string，defalut: `null`
  - `interval`: crawling interval，defalut: `0`(ms).or a random value in a range e.g.`[200,500]`
  - `retry`: retry times，defalut:`3`
  - `concurrency`: an integer for determining how many tasks should be run in parallel，defalut: `1`
  - `skipDuplicates`: whether skip the duplicate task(same url)，defalut: `false`

  - `requestOpts`: request options of task，**this is global request options**
    - `timeout`: defalut: `10000`
    - `proxy`: proxy address
    - `headers`: headers of request，defalut: `{}`
    - or other settings in [request opts][request-opts]

- `taskCounter`: count all finished tasks whether they are failed or not
- `failCounter`: count all failed tasks
- `doneCounter`: count tasks which has done
- `started`： boolean
- `finished`： boolean
- `errLog`: record all error infos in crawling
- `downloadDir`: downloaded files in here, default: `../__dirname`
- `drainAwait`: crawler will be finished when task-pool is drained.This prop will let crawler await adding tasks when task-pool is drained.default:`0`(ms)
- `tasksSize`: size of task-pool, exceeding tasks is in the buffer of task-pool, default:`50`
- `logger`: show the console log, default:`false`

### Crawler API

* `Crawler(opts: object)`

 construtor of `Crawler`
 
```javascript
// e.g.：
let c = new Crawler({
	interval: 1000,
	retry: 5,
	.... // other props of `crawler.settings`
	requestOpts: {
		timeout: 5000,
		proxy: 'http://xxx'
		.... // other props of `crawler.requestOpts`
	}
});
```
* `tweak(opts: object)`

 tweak settings of crawler
* `addTasks(urls: string or array[, props: obejct])`

 add task into task-pool

```javascript
// e.g.

// add single task

// input: url
c.addTask('http://www.google.com');

// input: url, prop
// set request options for the task(will override global)
c.addTask('http://www.google.com', {
	name: 'google',
	requestOpts: { timeout: 1 }
});

// input: url, next(processor of the task)
// crawler rules will not process this task again
c.addTask('http://www.google.com', function (result) {
	console.log('the task has done');
});

// input: url, prop, next
c.addTask('http://www.google.com', { name: 'google' }, function (result) {
	console.log('the task has done');
});

// or input an object
c.addTask({
	url: 'http://www.google.com',
	type: 'SE',
	next: function (result) {
		console.log('the task has done');
	}
});

// add multiple tasks

// input: an array of string
c.addTasks(['http://www.google.com','http://www.yahoo.com']);

// add prop for tasks
c.addTasks(['http://www.google.com','http://www.yahoo.com'], { type: 'SE' });
// get these props in processing function
c.addRule(function (result) {
	if (result.task.type == 'SE') {
		console.log('Searching Engine');
	}
});

// input: an array of object
c.addTasks([
	{
		url: 'http://www.google.com',
		name: 'google'
	},
	{
		url: 'http://www.sohu.com',
		name: 'sohu'
	}
]);

```

* `addRule(reg: string|object, func: function)`

 define a rule for scraping

```javascript
// e.g.：
let tasks = [
	'http://www.google.com/123', 
	'http://www.google.com/2546', 
	'http://www.google.com/info/foo',
	'http://www.google.com/info/123abc'
];
c.addTasks(tasks);
c.addRule('http://www.google.com/[0-9]*', function (result) {
	// match to tasks[0] and tasks[1]
});
c.addRule('http://www.google.com/info/**', function (result) {
	// match to tasks[2] and tasks[3]
});
// or you can not define the rule
c.addRule(function (result) {
	// match to all url in tasks
});

// $(i.e. cheerio.load(result.body)) is a optional arg
c.addRule(function (result, $){
    console.log($('title').text());
});
```
> Tip: light-crawler will transform all `.` in rule string.So you can directly write `www.a.com` instead of `www\\.a\\.com`.
If you need `.*`,you can use `**`, just like the upper example.If you have to use `.`,just `<.>`.

* `start()`

 start the crawler
```javascript
// e.g.：
c.start().then(function () {
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
 
* `stop()`

 stop the crawler
 
* `uniqTasks()`

 reomve duplicate task(deeply compare)

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
c.on('afterLog', function (info, isErr, type) {
	fs.appendFileSync('c.log', info); // append info to c.log
	....
};

// even you can replace the log()
c.log = function (info, isErr, type) {
	// log something....
};
```

### Download Files
just add `downloadTask: true` for task you need to download
```javascript
// e.g.：
// specify download directory
c.tweak({ downloadDir: 'D:\\yyy' });

let file = 'http://xxx/abc.jpg';
// 'abc.jpg' will be downloaded into 'D:\\yyy'
c.addTask(file, {downloadTask: true});
// or you can specify its name
c.addTask(file, {downloadTask: true, downloadFile: 'mine.jpg'});
// or specify relative dir(to 'D:\\yyy')
// if this directory ('jpg') doesn't exist,crawler will create it
c.addTask(file, {downloadTask: true, downloadFile: 'jpg/mine.jpg'});
// or specify absolute dir
c.addTask(file, {downloadTask: true, downloadFile: 'C:\\pics\\mine.jpg'});
```

### Events

* `start`

 after the crawler is started
```js
// e.g.
c.on('start', function () {
    console.log('started!');
});
```

* `beforeCrawl`

 task's props: `id`,`url`,`retry`,`working`,`requestOpts`,`downloadTask`,`downloadFile`...so on
```js
// e.g.
c.on('beforeCrawl', function (task) {
    console.log(task);
});
```

* `drain`

 when task-pool and its buffer are drained
```js
// e.g.
c.on('drain', function () {
    // perform something
});
```

* `error`

### Utils API

* `getLinks(html: string, baseUrl: string)`

 get all links in the element

```js
// e.g.：
let html = `
  <div>
	<ul>
		<li>
            <a href="http://link.com/a/1">1</a>
            <a href="a/2">2</a>
            <a href="b/3">3</a>
		</li>
		<li><a href="4">4</a></li>
		<li>foo</li>
	</ul>
</div>
`;
let links = Crawler.getLinks(html, 'http://link.com/index.html');
console.log(links);
// ['http://link.com/a/1','http://link.com/a/2','http://link.com/b/3','http://link.com/4']

// you can also use cheerio
let $ = cheerio.load(html);
let links = Crawler.getLinks($('ul'));
```

* `getImages(html: string, baseUrl: string)`

 like `getLinks`, get `src` from `<img>`.

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
load this file and set headers for requesting
```js
let headers = Crawler.loadHeaders('example.headers');
c.tweak({
	requestOpts: {
		headers: headers
	}
});
```

* `getRegWithPath(fromUrl: string)`

 get reg string with path of fromUrl
 
```js
let reg = Crawler.getRegWithPath('http://www.google.com/test/something.html');
// reg: http://www.google.com/test/**
```

### Advanced Usage

* `addRule`

```js
// since 1.5.10, the rule of scraping could be a object
c.addTask('http://www.baidu.com', { name: 'baidu', type: 'S.E.' });
c.addTask('http://www.google.com', { name: 'google', type: 'S.E.' });
// following rules has same reg string, but name are different
c.addRule({ reg: 'www.**.com', name: 'baidu' }, function (r) {
    // scraping r.body
});
c.addRule({ reg: 'www.**.com', name: 'google' }, function (r) {
    // scraping r.body
});

// using function match could make rules more complex
// boolean match(task)
c.addTask('http://www.baidu.com', { tag: 3 });
c.addTask('http://www.google.com', { tag: 50 });
c.addRule({ reg: 'www.**.com', match: function (task) {
		return task.tag > 10;
}}, function (r) {
    // scrape google
});
```

* `loadRule`

 recycle rules

```js
// lc-rules.js
exports.crawlingGoogle = {
    reg: 'www.**.com',
    name: 'google',
    scrape: function (r, $) {
        // ...
    }
};

// crawler.js
let c = new Crawler();
c.addTask('http://www.google.com', { name: 'google' });
c.loadRule(crawlingGoogle);

// or expand the function named 'scrape'
// implement the 'expand' in 'loadRule'
// on the other hand, you can use 'this'(Crawler) in 'addRule' or 'loadRule'
crawlingGoogle = {
    // ...
    scrape: function (r, $, expand) {
        expand($('title').text());
    }
};

crawlerAAA.loadRule(crawlingGoogle, function (text) {
    console.log(text);
    this.addTask('www.abc.com');
});

crawlerBBB.loadRule(crawlingGoogle, function (text) {
    console.log(text.toLowerCase());
});
```

* `removeRule`

 remove some rules

```js
// by its 'ruleName'
let rule = {
    // ...
    ruleName: 'someone'
    // ...
}
c.loadRule(rule);
c.removeRule('someone');
```

[request-opts]: https://github.com/request/request#requestoptions-callback
