const util = require('util');

const Crawler = require('../index');

let c;
let pages = 2;
let u = 'http://www.zgjtb.com/gonglu/node_123%s.htm';
let urls = [];

for (let i = 1; i <= pages; i++) {
	let p = i == 1 ? '' : '_' + i;
	urls.push(util.format(u, p));
}

c = new Crawler({ interval: 1500, logger: true });

c.addTasks(urls);

c.addRule('http://www.zgjtb.com/gonglu/node_123[_]?[0-9]*.htm', function (data, $) {
	let links = Crawler.getLinks($('.p-list .p-li-ul'), u);
	links = links.slice(0, 3);
	this.addTasks(links);
});

c.addRule('http://www.zgjtb.com/gonglu/[0-9]{4}-[0-9]{1,2}**.htm', function (data, $) {
	let title = $('.lbox2 .t-title h1').text();
	let info = $('.lbox2 .t-title p').text();
	console.log(title + ' ' + info);
});

c.start().then(function () {
	console.log('news-site-zgjtb has finished.')
});
