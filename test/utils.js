'use strict';

var expect = require('chai').expect;
	
var Crawler = require('../index');

describe('utils', function () {
	it('#getLinks()', function () {
		var html= `
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
		`;
		var links = Crawler.getLinks(html);
		expect(links).to.eql(['1','2','3','4']);
	});
});
