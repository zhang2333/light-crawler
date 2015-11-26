## Light Crawler - Simplified Crawler

English Doc(Here) or [中文文档](https://github.com/zhang2333/light-crawler/wiki/Chinese-Doc).

### How to install
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
c.addRule(function (data) {
	// data has 2 props : url and body
	// data.body is the HTML of the crawling page
	process data.body... // you can use cheerio
})
// start your crawler
c.start(function () {
	console.log('Finished!');
});
```
### Crawler Property

In light-crawler,crawling page is called `task`.Task will be put into task-pool and be executed in order.

* `settings`: crawler's basic settings
 * `interval`: crawling interval，defalut: `0`
 * `retry`: retry times，defalut:`3`
 * `concurrency`: an integer for determining how many tasks should be run in parallel，defalut: `1`
 * `skipRepetitiveTask`: whether delete the repetitive task(same url)，defalut: `true`
* `requestOpts`: settings of tasks，**every task is processed with these settings**
 * `timeout`: defalut: `10000`
 * `proxy`: proxy address
 * `headers`: headers of request，defalut: `{}`
 * or other settings in [request opts][request-opts]
* `taskCounter`: count all finished tasks whether they are failed or not
* `failCounter`: count all failed tasks
* `errLog`: log all error infos in crawling

### Crawler API

* `Crawler(opts: object)`
construtor of `Crawler`
```javascript
// e.g.：
var c = new Crawler({
	interval: 1000,
	retry: 5,
	.... // other props of `Crawler.settings`
	requestOpts: {
		timeout: 5000,
		proxy: http://xxx,
		.... // other props of`Crawler.requestOpts`
	}
});
```
* `twist(opts: object)`
like foregoing
* `addTasks(urls: string or array)`
add task into task-pool
```javascript
// e.g.：
c.addTasks('http://www.google.com');
// or an array
c.addTasks(['http://www.google.com','http://www.yahoo.com']);
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
c.addRule('http://www.google.com/[0-9]*', function (data) {
	// match to tasks[0] and tasks[1]
	// process data.body
});
c.addRule('http://www.google.com/info/**', function (data) {
	// match to tasks[2] and tasks[3]
	// process data.body
});
// or you can not define the rule
c.addRule(function (data) {
	// match to all url in tasks
	// process data.body
});
```
> Tip: light-crawler will transform all `.` in rule string.So you can directly write `www.a.com`,instead of `www\\.a\\.com`.If you need `.*`,you can use `**`, just like upper example.

* `start(callback: function)`
start the crawler
```javascript
// e.g.：
c.start(function () {
	// it will be called when task-pool was drained.
	console.log('done！');
});
```

### Utils API

* `getLinks(html: string)`
get all links in the element
```javascript
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

[request-opts]: https://github.com/request/request#requestoptions-callback