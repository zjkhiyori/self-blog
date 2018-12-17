---
title: 一个NodeJS生成excel表格的小demo
date: 2018-12-14 11:52:35
categories:
  - 技术
tags:
  - JavaScript
---

{% asset_img title_background.png Fuck产品经理 %}

## 环境准备
已经2018年了，广大人民群众基本都用上es6了，所以这里也配一下es6的环境

新建工程，创建一个package.json
```
{
	"name": "projectName",
	"version": "1.0.0",
	"devDependencies": {},
	"dependencies": {}
}

```
node版本建议不要太低，低版本对es6的兼容性不好，我这里使用的是8.9.0

然后安装babel
```
yarn add babel-cli

// 老版本babel-preset-2015已经废弃
yarn add babel-preset-env
```
然后再写几句es6测试一下
```
// 新建一个诗人类
class Poet {
  poem(...poemText) {
    console.log(poemText);
  }
}

epxort default Poet;

//新建一个Test.js类
import Poet from './Poet';
let poet = new Poet();
poet.poem('苟', '岂');

// 然后用babel node指令跑一下Test.js
babel-node Test.js
// [ '苟', '岂' ]
// 成功念出我想念的诗
```
es6环境就ok了

## 生成excel

我这里用的是一个随便找的库[excel-export](https://github.com/functionscope/Node-Excel-Export)，这个库的issue已经有人在喊"This project is DEAD!!!"

无视他继续安装
```
yarn add excel-export
```

使用方法我这里也只是简单用一下基本功能

```
const conf = {};
// 定义sheet名称
conf.name = "DBData";
// 定义列的名称以及数据类型
conf.cols = [{
  caption:'Name',
  type:'string'
},{
  caption:'Type',
  type:'string'
}];

// 定义row的数据
conf.rows = ['Tom', "String"];
```

<!-- more -->
