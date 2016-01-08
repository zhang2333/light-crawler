'use strict';

var expect = require('chai').expect;
	
var Crawler = require('../index');

describe('Utils', function () {
	it('#getLinks()', function () {
		var html= `
			<div>
				<ul>
					<li>
						<a href="http://link.com/a/1">1</a>
						<a href="a/2">2</a>
						<a href="b/3">3</a>
					</li>
					<li><a href="4">4</a></li>
					<li>blah</li>
				</ul>
			</div>
		`;
		var links = Crawler.getLinks(html, 'http://link.com/index.html');
		expect(links).to.eql(['http://link.com/a/1','http://link.com/a/2','http://link.com/b/3','http://link.com/4']);
	});
    
    it('#getImages()', function () {
		var html= `
			<div>
				<ul>
					<li>
						<img src="http://image.com/a/1.jpg" />
						<img src="a/2.png" />
						<img src="b/3.gif" />
					</li>
					<li><img src="4.jpeg" /></li>
					<li><img width="100px" /></li>
					<li>blah</li>
				</ul>
			</div>
		`;
		var images = Crawler.getImages(html, 'http://image.com/index.html');
		expect(images).to.eql(['http://image.com/a/1.jpg','http://image.com/a/2.png','http://image.com/b/3.gif','http://image.com/4.jpeg']);
	});
	
	it('#loadHeaders()', function () {
		var headers = Crawler.loadHeaders('samples/example.headers');
		expect(headers).to.have.deep.property('Host', 'abc');
	});
});
