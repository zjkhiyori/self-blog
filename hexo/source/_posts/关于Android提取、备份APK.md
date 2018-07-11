---
title: 关于Android提取、备份APK
date: 2018-07-10 15:04:22
categories:
  - 技术
tags:
  - React Native
  - Android
---

{% asset_img title_background.jpeg real fragrant warning %}

## 通过adb提取APK
Android提取apk有两种途径，一种是通过adb
```
// 列出所有安装包
adb shell pm list package

// 找到你需要提取的包名，然后获取路径
adb shell pm path packageName

// 输出路径后拷贝或者pull到你的电脑
adb pull apkPath ~/Download

// 某些设备可能需要root权限才能访问这个path路径
```
<!-- more -->
另一种方法就是通过编写App进行提取/备份apk

## 通过编写App提取/备份APK
这种方法主要通过`packageManager`来获取系统的所有应用信息`packageInfo`，里面包含了应用路径，包名，应用名等信息，然后根据路径进行拷贝以及备份

## ApkExtractor工具
个人通过闲暇时间写的一个apk提取工具，使用React Native构建，数据框架使用Mobx，欢迎下载体验

项目地址：https://github.com/zjkhiyori/ApkExtractorRN
{% asset_img demo.gif 预览图 %}