---
title: 记一次RN Android端在Mobx环境下使用FlatList导致列表错乱的问题
date: 2018-04-26 17:04:07
categories:
  - 技术
tags:
  - React Native
  - Android
---

{% asset_img title.jpeg 日常peropero 好久没拍塑料小人了 %}

## 排查结果
首先说下结果，以供参考
github的issue有FlatList不显示的问题，表现的跟我不太一样，他们解决方案是将`removeClippedSubviews={false}`，我尝试了一下不适用我的场景
最终找出罪魁祸首是mobx的observable变量与FlatList的data在release环境下，未关闭RN log日志所导致的冲突
* 解决方案1：release环境关掉日志（我是用babel的`transform-remove-console`插件来关闭的）
* 解决方案2：如果一定要开日志，FlatList的data不要给observable Array，给普通Array

<!-- more -->

## 问题描述
首先问题如下：
我的RN版本`0.54.0`，mobx`3.4.1`，mobx-react`4.3.5`
![列表错乱现象](https://upload-images.jianshu.io/upload_images/4730298-252cc6c124e102f4.jpeg?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

一个长度为两百多的数组只显示了二十三条，后面全是空白，继续往下划是一个无限空白的list，还伴随着闪屏现象，太可怕，更可怕的是debug包无此问题，release包却有，最怕排查这种问题，耗时耗力

## 解决思路
当时第一反应是没做分页一次性加载太多数据导致的，因为没有想到这个接口会有这么多数据，一般也就十几二十条，随即进行了分页处理，然而并没有什么卵用，仍然是二十三条后就显示空白，再往后滑动闪屏，此时也没有其他头绪，这下子只能啃源码来看什么原因了，不过好在FlatList是纯js实现的，不需要再去啃Java代码了。
首先找到FlatList.js文件，看它的render函数

![render函数](https://upload-images.jianshu.io/upload_images/4730298-8aee73f45bf505e2.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

通过配置`legacyImplementation`来选择使用`MetroListView`或者`VirtualizedList`前者是老的ListView，后者就是替代老ListView的新列表组件，官方解释这个变量是用来比较性能的，一般用不着，着重看看`VirtualizedList `，view出了问题首先就看看`renderItem`方法，下图为`VirtualizedList`的`renderItem`方法

![VirtualizedList的renderItem方法](https://upload-images.jianshu.io/upload_images/4730298-eb0687b8e78b93c0.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

这里就只是区分了多栏与单栏列表，我的使用场景是单栏列表，这行代码就只是给FlatList使用者回传了一个info参数，再看看info参数具体，找到`VirtualizedList`的代码，再找`renderItem`这个props在哪里调用的，下图为`CellRenderer的render`方法里`renderItem`回传参数

![CellRenderer的render方法里renderItem回传参数](https://upload-images.jianshu.io/upload_images/4730298-24d4fac0c56e442f.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

可以看到是在`CellRenderer`这个组件的render方法里调用的，传入了`item，index，separators`，我们要找的就是item，但是item是从props中拿到的，再找找`CellRenderer`在哪里使用，可以看到是在`_pushCells`方法中使用，`_pushCells`方法在`VirtualizedList `的render方法中调用，下图为`VirtualizedList`的`render`方法

![VirtualizedList的render方法](https://upload-images.jianshu.io/upload_images/4730298-c129e421ac78c6a7.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

cells作为`React.cloneElement(element,[props],[...children])`的第三参数，如上图代码，此时基本可以确定问题应该在这个`cells`参数上了，再回头看看`_pushCells `方法，下图为`VirtualizedList`的`_pushCells`方法

![VirtualizedList的_pushCells方法](https://upload-images.jianshu.io/upload_images/4730298-f17d8aba21012b3f.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

可以看到item数据是来自props的`getItem`方法，这个方法传入了一个data和一个ii下标，顾名思义应该就是在取单个列表的渲染数据，这个data就是FlatList的data，我们的列表数据源，再回到调用方FlatList找到`getItem `方法，下图为`FlatList`的`getItem`方法

![FlatList的getItem方法](https://upload-images.jianshu.io/upload_images/4730298-5b20cb33eee3fd3d.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

这个方法只是对多栏和单栏列表取数据的逻辑做了区分，我们可以试着把取出来的数据打印出来看是否有异常，加好调试代码，再编译一个带log的release包

![item数据](https://upload-images.jianshu.io/upload_images/4730298-aabfc4f46cbe3b09.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

可以看到第23个都挺正常，到了24个就不正常了，到了28个直接抛出error了，加了调试日志之后还会crash了，所以这个数据源可能有问题，联想到我用的Mobx框架，传给data的是一个Observable Array，而非普通Array，猜测是Observable Array与FlatList在此环境下有冲突，随后将其替换成普通Array，然后打包，测试一切正常

## 结尾
当时得出结论是FlatList和Observable Array搭配使用就会在release环境出问题，但是如果是这种结果，那问题影响面就太大了，然后发现我打的release包为了方便定位bug，将`transform-remove-console`这个插件屏蔽了，打开了js日志。随后我又试着关闭日志，FlatList继续使用Observable Array，然后打包，测试一切正常，然后就经过了几番测试，基本确认了问题所在，实在有点玄学，为了定位这一个bug，打了快一天的包。。当然结论不重要，重要的是解决问题过程，以后再遇到这种问题，解决起来应该更加得心应手
