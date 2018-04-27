---
title: 浅析JS闭包（Closure）与函数的柯里化（Currying）
date: 2018-04-26 15:55:57
categories:
  - 技术
tags:
  - JavaScript
---

 ![3月3号老任就要发售Switch了，还有塞尔达护航新作，然而我并没有钱买...](http://upload-images.jianshu.io/upload_images/4730298-bf07a7b877e5cece.jpg?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

<!-- more -->

## JS闭包
闭包在程序界是一个很抽象的概念，以至于被人称为编程界的哈姆雷特，我们先来看看MDN对其的解释
>Closures are functions that refer to independent (free) variables (variables that are used locally, but defined in an enclosing scope). In other words, these functions 'remember' the environment in which they were created.
* 闭包是一个函数，特指那些可以访问独立变量的函数（这种独立变量在本地使用，但是却定义在一个封闭的作用域），换句话说这类函数能够记忆创建它们时的环境

其实我个人理解更倾向于：
>当嵌套函数的引用传递给了嵌套函数作用域之外的变量，或者对象的属性，此时就会形成一个闭包

嗯，解释的很好，但我还是不知道这是个啥
那还是少废话上代码吧。。
```
function person() {
  var name = 'ergouzi';
  console.log(name);
}
person();
console.log(name);
输出：
//ergouzi
//undefined
```
很普通的一个函数，正常理解函数与变量的思维就是：函数执行，定义变量，函数执行完毕，变量销毁。再来看看另一种写法
```
function person() {
  var name = 'ergouzi';
  var nameFunc = function() {
    console.log(name);
  }
  return nameFunc;
}
var personFunc = person();
personFunc();
输出：
//ergouzi
```
可以看到，这里即使person函数执行完毕了，但是里面的name变量却没有被销毁，这里再套用开头解释的概念，应该能理解部分了吧。咱们再来验证一下这种“被记忆的独立变量”的特性
```
function person() {
  var name = 'ergouzi';
  var funcObj = {
    'nameFunc': function () {
      console.log(name);
    },
    'changeFunc': function () {
      name = 'goudanzi';
    }
  }
  return funcObj;
}
var funcObj = person();
funcObj.changeFunc();
funcObj.nameFunc();
输出：
//goudanzi
```
可以看到，我们在该独立变量的作用域外部改变了它的值，所以说明相同环境里创建的闭包函数，引用的独立变量为同一份拷贝，即同一个对象。其实用chrome调试一下就能很清楚的看到闭包函数长啥样，比如我这里的闭包函数它长这样（还长得挺漂亮的）

![](http://upload-images.jianshu.io/upload_images/4730298-eba7944d4b6cba5e.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
我们可以看到两个函数“changeFunc”，“nameFunc”，从他们的Scopes里面都能找到Closure并且创建环境都为person，记忆的独立变量都为“name”，

再来看点哦莫西罗伊的
```
for (var i = 0; i < 10; i++) {
  setTimeout(function(){
    console.log(i)
  }, 0);
}
输出：
//10
//10
//10
//10
//10
//10
//10
//10
//10
//10
//简要解释一下输出值，因为setTimeout是异步函数，在i=0第一次循环时只是定义了第一个定时函数而并没有执行它，待到执行第一个定时函数，但此时i的值已经变了
```
一个普通的for循环，每次循环定义了一个定时器函数，因为没有给定时器函数的句柄传参，它只能拿到i最后的值。我们换一种“闭包”一点的写法
```
for (var i = 0; i < 10; i++) {
  setTimeout(((j) => console.log(j))(i), 0);
}
//或者这样写
for (var i = 0; i < 10; i++) {
  (j => setTimeout((j) => console.log(j), 0))(i);
}
```
这里用到了es6的箭头函数，想详细了解箭头函数请移步[箭头函数](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions)
这里的代码将每次循环的i值传给了一个闭包函数，此时这个闭包函数记忆了这个i的值，等到执行定时函数时，就可以正常打印出i值。
>参考文档https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures

```
//未完待续，懒癌犯了剩下的下次补...
//接下来是每周最开心的游戏时间，仁王继续落命中...
```