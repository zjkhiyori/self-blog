---
title: shadowsocks服务搭建以及全局代理
date: 2018-11-13 15:40:10
categories:
  - 技术
tags:
  - extra
---

{% asset_img title.jpeg %}
最近又有一台服务器被GFW给干掉了，又得掏腰包买服务器跟搭建环境了，这次记录一下方便以后翻出来看吧

<!-- more -->

项目地址: [shadowsocks](https://github.com/shadowsocks/shadowsocks/tree/rm)（可以看到打开是个空项目，分支切换到master就可以看到原始项目了，据说是作者被请喝茶才出此下策？这些人这么好忽悠的吗？）

因为本人对科学上网有一定需求，公司邮箱也用Gmail，手机也用google全家桶，所以一般都会配备至少两台服务器，如果跟我一样有需求的，建议也至少配备两台

关于服务器购买就不多说了，我用的是这个[Aplpharacks](https://www.alpharacks.com)，一台VPS 512m或者256m内存的完全够用，我有一台早期买的128m的，大部分时间速度比其他几台要快，可能是哥伦比亚机房的原因？不过现在已经没得卖了，现在主要卖的都是洛杉矶机房，稳定性一般，网络好峰值可达4m/s，网络差的时候基本瘫痪

* 优点：便宜，因为偶尔可能会中奖ip被GFW封，所以买个便宜的封了也不心疼
* 缺点：不稳定

### 服务搭建及部署

搭建过程很简单，首先下载基础包跟python包管理器

我一般都是用Ubuntu，这里以Ubuntu为例
```
apt-get install python-pip
pip install git+https://github.com/shadowsocks/shadowsocks.git@master
```
安装好了键入
```
ssserver -h
```
有相应指令帮助提示就表面基础包已经ok

然后就是编辑配置信息
```
// 新建一个json配置文件
touch ~/shadowsocks.json

// 然后编辑
vim ~/shadowsocks.json

{
    // 你的服务器ip
    "server": "*.*.*.*",
    // 配置多个端口及密码，
    "port_password": {
        "8080": "hello",
        "8081": "hello",
        "8082": "hello",
        "8083": "hello",
        "8084": "hello",
        "8085": "hello",
        "443": "hello"
    },
    // 单个端口配置
    "server_port":8388,
    "password": "hello",

    "local_address": "127.0.0.1",
    "local_port": 1080,
    "timeout": 500,
    "method": "rc4-md5"
}
```
这里强烈建议多开几个端口备用，因为使用中发现GFW会对端口进行干扰，如果只配置了一个端口，被干扰后整台服务器无法使用，所以多开几个端口备用，一个端口失效了换其他端口试试

弄完配置文件就可以部署服务了

执行指令
```
前台启动方式
ssserver -c ~/shadowsocks.json
后台启动方式
ssserver -c ~/shadowsocks.json -d start
```
执行完后可以看看端口使用情况
```
netstat -tunpl
```
可以看到刚才配置的端口使用情况，能看到刚才配置的端口就表明部署ok了，剩下就是客户端的事情了

客户端建议下载[ShadowsocksX-NG](https://github.com/shadowsocks/ShadowsocksX-NG/releases)

客户端配置好应该就能上网了，注意加密方式与服务端保持一致

### 全局代理
因为chrome支持http转socks5协议，而终端不支持，所以终端无法走socks5协议，此时我们就需要一个全局代理，我用的是Proxifier，价格40刀，软件卖的比较贵，有条件的同学还请支持正版，网上也有很多破解资源

打开代理配置，增加一条配置
{% asset_img proxifier.png %}

这里填入你shadowsocksX-NG的本地监听地址以及端口
{% asset_img proxy_setting.png Proxifier配置 %}
{% asset_img shadowsock_setting.jpg shadowsocksX-NG本地socks5 %}
然后打开rules，default设置为下图
{% asset_img proxifier_rules_setting.png rules设置 %}
然后回Proxifier首页将应用设置为gobal（默认为NONE）

此时connection栏目就能监控到你的网络请求，控制台也能科学上网了

然后我就可以登录我可怜的，才用了几个月的，被封禁的服务器了TAT。。。






