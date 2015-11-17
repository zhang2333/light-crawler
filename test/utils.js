'use strict';

var cheerio = require('cheerio'),
	expect = require('chai').expect;
	
var Crawler = require('../index');

describe('utils', function () {
	it('#getLinks()', function () {
		var $ = cheerio.load(`
		<ul>
			<li>
			<a href="1">1</a>
			<a href="2">2</a>
			<a href="3">3</a>
			</li>
			<li><a href="4">4</a></li>
			<li></li>
		</ul>
		`);
		var links = Crawler.getLinks($('ul'));
		expect(links).to.eql(['1','2','3','4']);
	});
});
