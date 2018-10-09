const path = require('path')

const Crawler = require('../index')

const c = new Crawler({
	downloadDir: path.resolve(__dirname, 'images'), // replace me
	interval: 50,
	logger: true,
	concurrency: 1,
	retry: 0,
})

const taskArr = [
	{
		url: 'https://gss0.bdstatic.com/94o3dSag_xI4khGkpoWK1HF6hhy/baike/s%3D220/sign=a3b6110d74f0f736dcfe4b033a54b382/7af40ad162d9f2d35ffe039da5ec8a136227ccd0.jpg',
		downloadTask: true,
		downloadFile: 'Luffy.jpg',
	},
	{
		url: 'https://gss1.bdstatic.com/9vo3dSag_xI4khGkpoWK1HF6hhy/baike/s%3D220/sign=b047aa4c77ec54e745ec1d1c89399bfd/18d8bc3eb13533fa13f3b45ca4d3fd1f41345b7e.jpg',
		downloadTask: true,
		downloadFile: 'Zoro.jpg',
	},
	{
		url: 'https://gss0.bdstatic.com/94o3dSag_xI4khGkpoWK1HF6hhy/baike/s%3D220/sign=89d295942b7f9e2f74351a0a2f31e962/0b46f21fbe096b63de7d792200338744ebf8ac5f.jpg',
		downloadTask: true,
		downloadFile: 'Nami.jpg',
	},
	{
		url: 'https://gss3.bdstatic.com/7Po3dSag_xI4khGkpoWK1HF6hhy/baike/s%3D220/sign=3a1153769b0a304e5622a7f8e1c8a7c3/34fae6cd7b899e51c8bd1d664ea7d933c8950d94.jpg',
		downloadTask: true,
		downloadFile: 'Usopp.jpg',
	},
	{
		url: 'https://gss0.bdstatic.com/-4o3dSag_xI4khGkpoWK1HF6hhy/baike/s%3D220/sign=96cddebe12178a82ca3c78a2c602737f/908fa0ec08fa513d327c48ac316d55fbb3fbd9e9.jpg',
		downloadTask: true,
		downloadFile: 'Sanji.jpg',
	},
	{
		url: 'https://gss1.bdstatic.com/9vo3dSag_xI4khGkpoWK1HF6hhy/baike/s%3D220/sign=580281109422720e7fcee5f84bca0a3a/96dda144ad345982e342c1e000f431adcaef84f3.jpg',
		downloadTask: true,
		downloadFile: 'Chopper.jpg',
	},
	{
		url: 'https://gss1.bdstatic.com/9vo3dSag_xI4khGkpoWK1HF6hhy/baike/s%3D220/sign=74a344b9befb43161e1f7d7810a54642/faf2b2119313b07e834e747a00d7912396dd8cd4.jpg',
		downloadTask: true,
		downloadFile: 'Robin.jpg',
	},
	{
		url: 'https://gss3.bdstatic.com/-Po3dSag_xI4khGkpoWK1HF6hhy/baike/s%3D220/sign=d2d763b28e025aafd73279c9cbecab8d/b999a9014c086e061e511a390e087bf40bd1cbc2.jpg',
		downloadTask: true,
		downloadFile: 'Franky.jpg',
	},
	{
		url: 'https://gss2.bdstatic.com/-fo3dSag_xI4khGkpoWK1HF6hhy/baike/s%3D220/sign=a1ae69730655b31998f9857773a88286/562c11dfa9ec8a136d4a7292fb03918fa0ecc06b.jpg',
		downloadTask: true,
		downloadFile: 'Brook.jpg',
	},
	{
		url: 'https://gss1.bdstatic.com/-vo3dSag_xI4khGkpoWK1HF6hhy/baike/s%3D220/sign=a496058c3ad3d539c53d08c10a86e927/d4628535e5dde711fd936684abefce1b9d16617a.jpg',
		downloadTask: true,
		downloadFile: 'Jinbe.jpg',
	},
]

c.addTasks(taskArr)

c.on('error', (e) => {
	console.error('catched:', e)
})

c.start().then(function () {
	console.log('finished')
})
