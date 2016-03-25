## Light Crawler - 简易定向爬虫

[![Build Status](https://travis-ci.org/zhang2333/light-crawler.svg)](https://travis-ci.org/zhang2333/light-crawler)

### 安装

```shell
npm install light-crawler
```

### 简例

```javascript
var Crawler = require('light-crawler');
// 创建一个Crawler的实例
var c = new Crawler();
// 加入要爬取的url字符串数组或单个url字符串
c.addTasks('http://www.xxx.com');
// 定义一个处理数据的函数
c.addRule(function (result) {
	// 这里返回的result有task和body两个属性
    // result.task的属性 : id, url, 以及其他你添加的
	// result.body就是爬取页面得到的html代码
	在这里处理result.body... // 你可以使用cheerio
})
// 启动爬虫，并定义爬虫完成的回调函数
c.start(function () {
	console.log('完成!');
});
```

### Crawler 属性

在light-crawler每一次爬取页面的行为被称为一个任务，根据顺序执行的次序任务会被赋予相应的`id`。任务会被放置在`Crawler`的任务池中依次执行，设置`Crawler.settings.concurrency`可以指定爬虫同时执行几个任务。

* `settings`: 爬虫的基本设置
 * `id`: 爬虫的id，可以是字符串也可以是整型，主要用于和其他爬虫区分
 * `interval`: 爬取间隔的毫秒值，默认为`0`(毫秒).或者是一个范围内的随机值，如`[200,500]`
 * `retry`: 重试次数，默认为`3`
 * `concurrency`: 并发爬取页面数，默认为`1`
 * `skipDuplicates`: 是否去除重复的任务（相同的url），默认为`false`

* `requestOpts`: 爬取任务的设置，**这是全局request参数**
 * `timeout`: 任务超时时间的毫秒值，默认为`10000`
 * `proxy`: 代理地址
 * `headers`: 请求头信息，默认为`{}`
 * 以及其他所有的[request选项][request-opts]

* `taskCounter`: 记录爬过的任务数
* `failCounter`: 记录爬取失败的任务数
* `doneCounter`: 记录已正常完成的任务数
* `started`： boolean
* `finished`： boolean
* `errLog`: 记录爬取过程中遇到的异常。单个任务产生的异常不会阻止后面要执行的任务，异常信息会被保留在`errLog`里面，在爬虫结束时输出。
* `downloadDir`: 下载文件的目录, 默认: `../__dirname`
* `drainAwait`: 爬虫将在任务池为空时结束，此属性可设置爬虫等待后续需要添加任务的超时时间。默认:`0`(毫秒)
* `tasksSize`: 任务池的大小，超过的部分会被放入任务池的缓冲池中, 默认:`50`

### Crawler API

* `Crawler(opts: object)`

 `Crawler`的构造函数，传入的`opts`可以设置`Crawler`的属性
```javascript
// 例：
var c = new Crawler({
	interval: 1000,
	retry: 5,
	.... // 其他`Crawler.settings`属性
	requestOpts: {
		timeout: 5000,
		proxy: 'http://xxx'
		.... // 其他`Crawler.requestOpts`属性
	}
});
```
* `tweak(opts: object)`

 调整`Crawler`参数
* `addTasks(urls: string or array[, props: obejct])`

 添加任务至任务池中
 
```javascript
// 例：
c.addTasks('http://www.google.com');
// 或者是一个数组
c.addTasks(['http://www.google.com','http://www.yahoo.com']);

// 给task添加属性
c.addTasks('http://www.google.com', { disc: 'google首页' });
// 给一组task添加相同的属性
c.addTasks(['http://www.google.com','http://www.yahoo.com'], { type: 'SE' });
// 在处理函数中可以得到这些属性
..function (result) {
	if (result.task.type == 'SE') {
		console.log(result.task.url + '是搜索引擎');
		...
	}
	...
}...

// 或者给任务指定request参数（将覆盖全局的）
c.addTasks('http://www.google.com', { requestOpts: { timeout: 1 } });
```
* `addRule(reg: string|object, scrape: function)`

 添加一个规则以匹配某些任务，并使用定义好的函数来处理得到的数据
```javascript
// 例：
var tasks = [
	'http://www.google.com/123', 
	'http://www.google.com/2546', 
	'http://www.google.com/info/foo',
	'http://www.google.com/info/123abc'
];
c.addTasks(tasks);
c.addRule('http://www.google.com/[0-9]*', function (result) {
	// 将匹配到tasks[0]和tasks[1]
	// 处理result.body
});
c.addRule('http://www.google.com/info/**', function (result) {
	// 将匹配到tasks[2]和tasks[3]
	// 处理result.body
});
// 你也可以不写规则字符串
c.addRule(function (result) {
	// 将匹配到tasks中所有的url
	// 处理result.body
});

// 处理函数可以添加一个可选参数`$`，`$`即`cheerio.load(result.body)`
c.addRule(function (result, $){
    console.log($('title').text());
});
```
> 需要注意的是light-crawler默认会转换掉规则字符串中所有的`.`。所以你直接写`www.a.com`即可而不必写成`www\\.a\\.com`。
如果你需要用到`.*`，那么写成`**`即可，如上述例子。如果一定要使用`.`，请用`<.>`代替。

* `start(callback: function)`

 启动爬虫，并指定完成时的回调函数
```javascript
// 例：
c.start(function () {
	// 任务池为空时，爬虫就被视为完成了所有任务
	console.log('完成！');
});
```

* `pause()`

 暂停爬虫任务

* `resume()`

 继续爬虫任务

* `isPaused()`

 爬虫是否被暂停
 
* `stop()`

 停止爬虫
 
* `uniqTasks()`

 去重当前任务队列(深度比较)

* `log(info: string, isErr: boolean, type: int)`

 Crawler's logger
 
```javascript
// 例：
// 如果这一条log是errorlog，那么c.errLog会追加它
c.log('some problems', true);
// 控制台输出: 
// [c.settings.id]（如果爬虫有id）some problems

// type是每行log中第一个'[...]'字符串的颜色标记, 比如'[Crawler is Finished]'
// type的取值：1 red,2 green,3 yellow,4 blue,5 magenta,6 cyan等等
c.log('[已解析]blahblah~', false, 4);
// console print: 
// [c.settings.id]（如果爬虫有id）[已解析]([已解析]将是蓝色的)blahblah~

// 你可以在每次log()之后做一些操作
c.on('afterLog', function (info, isErr, type) {
	fs.appendFileSync('c.log', info); // 将会追加到c.log
	....
};

// 你甚至可以把log()覆盖为自定义的
c.log = function (info, isErr, type) {
	process info....
};
```

### 下载文件

为task添加`downloadTask: true`的属性即可
```javascript
// 例：
// 指定下载目录
c.tweak({ downloadDir: 'D:\\yyy' });

var file = 'http://xxx/abc.jpg';
// abc.jpg 将会被下载到 D:\\yyy
c.addTasks(file, {downloadTask: true});
// 也可指定文件名
c.addTasks(file, {downloadTask: true, downloadFile: 'mine.jpg'});
// 可以是相对路径(D:\\yyy)
// 如果上级目录不存在，爬虫将会自动创建
c.addTasks(file, {downloadTask: true, downloadFile: 'jpg/mine.jpg'});
// 可以是绝对路径
c.addTasks(file, {downloadTask: true, downloadFile: 'C:\\pics\\mine.jpg'});
```

### 事件

* `start`

 爬虫开始运行后触发

```js
// 例
c.on('start', function () {
    console.log('爬虫已开始工作！');
});
```

* `beforeCrawl`

 每个任务在发起请求前被触发。task属性: `id`,`url`,`retry`,`working`,`requestOpts`,`downloadTask`,`downloadFile`等
```js
// 例
c.on('beforeCrawl', function (task) {
    console.log(task);
});
```

* `drain`

 任务池及其缓冲池为空时
```js
// 例
c.on('drain', function () {
    // do something
});
```

* `error`

### Utils API

* `getLinks(html: string, baseUrl: string)`

 获取HTML中某元素下的所有链接地址

```js
// e.g.：
var html = `
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
var links = Crawler.getLinks(html, 'http://link.com/index.html');
console.log(links);
// ['http://link.com/a/1','http://link.com/a/2','http://link.com/b/3','http://link.com/4']

// 也可以配合cheerio一起使用
var $ = cheerio.load(html);
var links = Crawler.getLinks($('ul'));
```

* `getImages(html: string, baseUrl: string)`

 与 `getLinks` 相仿, 从 `<img>` 得到 `src`

* `loadHeaders(file: string)`

 从文件加载headers
 
 `example.headers`headers文件示例
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
加载文件，然后将headers对象传给request
```js
var headers = Crawler.loadHeaders('example.headers');
c.tweak({
	requestOpts: {
		headers: headers
	}
});
```

* `getRegWithPath(fromUrl: string)`

 根据url得到该路径的规则字符串
 
```js
var reg = Crawler.getRegWithPath('http://www.google.com/test/something.html');
// reg: http://www.google.com/test/**
```

### 进阶用法

* `addRule`

 `addRule`的更多用法

```js
// 从1.5.10开始，匹配规则得到了扩展，匹配规则将不局限于匹配任务的url属性
c.addTasks('http://www.baidu.com', { name: 'baidu', type: '搜索引擎' });
c.addTasks('http://www.google.com', { name: 'google', type: '搜索引擎' });
// 你可能已经注意到了，下面的两个正则是同样的，而name值却不同
// 不过属性的命名最好避免 'reg' 'match' 'scrape' 'expand'
c.addRule({ reg: 'www.**.com', name: 'baidu' }, function (r) {
    // 处理result.body
});
c.addRule({ reg: 'www.**.com', name: 'google' }, function (r) {
    // 处理result.body
});

// 指定名为match的函数可设置更为复杂的匹配规则
// match函数接受参数task，返回一个布尔值
c.addTasks('http://www.baidu.com', { tag: 3 });
c.addTasks('http://www.google.com', { tag: 50 });
c.addRule({ 
    reg: 'www.**.com', 
    match: function (task) {
        return task.tag > 10;
    }}, function (r) {
    // 处理google
});
```

* `loadRule`

 加载Rule，意味着你可以重复利用同一个Rule

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
var c = new Crawler();
c.addTasks('http://www.google.com', { name: 'google' });
c.loadRule(crawlingGoogle);

// 或者可以对同一规则进行不同扩展，不过scrape需要第三个参数
// 在loadRule中实现该扩展即可
// 另外，如果你需要在'addRule'或'loadRule'的处理函数中使用爬虫对象，直接使用'this'即可
var crawlingGoogle = {
    // ...
    scrape: function (r, $, expand) {
        expand($('title').text());
    }
};

crawlerAAA.loadRule(crawlingGoogle, function (text) {
    console.log(text);
    this.addTasks('www.abc.com');
});

crawlerBBB.loadRule(crawlingGoogle, function (text) {
    console.log(text.toLowerCase());
});
```

* `removeRule`

 移除Rule
 
```js
// 根据ruleName移除Rule
var rule = {
    // ...
    ruleName: 'someone'
    // ...
}
c.loadRule(rule);
c.removeRule('someone');
```

[request-opts]: https://github.com/request/request#requestoptions-callback