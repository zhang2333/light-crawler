## Light Crawler - Simplified Crawler

### How to install
```shell
npm install light-crawler
```

### Example
```javascript
// create a Crawler instance
var Crawler = require('light-crawler');
var c = new Crawler();
// add a url or array of url for crawling
c.addTasks('http://www.xxx.com');
// define a crawling rule and processing funciton
c.addRule(function (data) {
	// data has 2 props : url and body
	// data.body is the HTML of the crawling page
	processing data.body... // you can use cheerio
})
// start your crawler
c.start(function () {
	console.log('Success!');
});
```