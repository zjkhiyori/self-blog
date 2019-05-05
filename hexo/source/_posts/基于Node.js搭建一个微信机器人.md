---
title: 基于Node.js搭建一个微信机器人
date: 2019-05-05 11:51:43
categories:
  - 技术
tags:
  - JavaScript
---
## 将要实现的功能
 * 自动聊天，可以把它扔群里跟大家~~聊骚~~聊天
 * 每日简报，给同事家人定时播报头条简报
 * 每日天气预报，给你~~程序猿哪来的老婆~~老婆嘘寒问暖

## 基本架构
本项目基于[Wechaty](https://github.com/Chatie/wechaty)，这是一个封装了微信基本事件的开源库，比如`onLogin（登陆事件）`，`onMessage（消息事件）`，`onLogout（登出事件）`等等，详细使用可参考该项目文档，
有了这些事件，我们可以基于Node.js很轻松的开发一些常用功能。

本项目Node版本需要 >= 10，可以自行安装nvm进行版本切换。

本项目工程代码[wechat-boy](https://github.com/zjkhiyori/wechat-boy)
<!-- more -->
## 编码实现
### 小试牛刀
首先新建工程，创建一个package.json，引入要用的库
```
"devDependencies": {
    "babel-cli": "^6.26.0",
    "babel-preset-es2015": "^6.24.1", // es6转es5，不想写es6可以不用这两个
    "node-schedule": "^1.3.2",  // 定时任务
    "qrcode-terminal": "^0.12.0", // 打印登陆二维码
    "rimraf": "^2.6.3", // 终端指令工具
    "wechaty": "^0.22.6", // Wechaty基础库
    "moment": "2.24.0" // 日期处理
  },
  "dependencies": {
    "axios": "^0.18.0" // 网络请求
  }
```
然后执行npm install 或者 yarn，然后可以在index.js里简单写一个demo，
```
import QrTerm from 'qrcode-terminal';

  Wechaty.instance({ name: 'wechat-boy' })
  .on('scan', qrcode => {
    console.log(`onScan: ${qrcode}`);
    QrTerm.generate(qrcode);
  })
  .on('login', user => {
    console.log(`onLogin: ${user.name()}`);
  })
  .on('message', msg => {
    console.log(`from ${msg.from().name()} message: ${msg.text()}`)
  })
  .on('logout', usr => {
    console.log(`user ${user.name()} logout`)
  })
```
然后执行npm start，第一次会下载一些依赖，而且依赖很大，要等一段时间，如果实在下载不下来可能要全局FQ了，
可参考我另一篇[使用proxifier全局代理](http://syachiku.cn/2018/11/13/shadowsocks%E6%9C%8D%E5%8A%A1%E6%90%AD%E5%BB%BA%E4%BB%A5%E5%8F%8A%E5%85%A8%E5%B1%80%E4%BB%A3%E7%90%86)

启动成功后会打印出登陆二维码
{% asset_img login-qrcode.png 登陆二维码示例 %}

扫码登陆，就可以侦听消息事件了

### 接入图灵机器人实现聊天功能
上一步里的回调侦听事件测试ok了后，我们就可以做点实际功能了，实现自动聊天功能只需在`message`回调里操作就行。

编辑message回调方法
```
on('message', async (msg) => {
  if (msg.self()) return;
  const room = msg.room();
  const content = msg.text();
  const contact = msg.from();
  let reply;
  if (room) {
    // 代表群消息
  } else {
    // 个人消息
    reply = await Service.reply(content);
    console.log(`tuling reply: ${reply}`)
    await contact.say(reply)
  }
})

// Service.reply
static async reply(content) {
    let response;
    try {
      const data = await this.get('http://www.tuling123.com/openapi/api', {
        params: {
          // key需要去http://www.tuling123.com申请
          key: TULING_API_KEY,
          info: content,
        }
      });
      if (data.code === 100000) {
        response = data.text;
      } else {
        throw new Error(TULING_ERROR_MESSAGE);
      }
    } catch (e) {
      response = e.message;
    }
    return response;
}

// axios get
static async get(url, params) {
    let response;
    try {
      response = await axios.get(url, params);
      console.log('------------success-----------');
      console.log(`${response.status}\n${response.statusText}\n${JSON.stringify(response.data, null, 2)}\n`)
    } catch (e) {
      console.log('------------error-------------');
      console.error(e);
      throw e
    }
    return response.data;

}
```
加入这些逻辑，此时你的账号已经可以自动~~聊骚~~聊天啦

### 接入每日简报，天气功能
每日自动播报功能就要用到schedule任务了，这里我们使用node-schedule库，在login的回调中执行定时功能
```
import Schedule from 'node-schedule'

const boy = Wechaty.instance({ name: 'wechat-boy' });
boy
.on('login', (usr) => {
  // 设置定时任务, 每天凌晨8点触发，
  // 每分钟的第30秒： '30 * * * * *'
  // 每小时的1分30秒 ：'30 1 * * * *'
  // 每天的1点1分30秒 ：'30 1 1 * * *'
  // 每月的1日1点1分30秒 ：'30 1 1 1 * *'
  // 每周1的1点1分30秒 ：'30 1 1 * * 1'
  // 详情见node_schedule文档
  Schedule.scheduleJob('0 0 8 * * *', async () => {
    // 寻找备注名称为${alias}的联系人
    const contact = await boy.Contact.find({ alias: `${alias}` })
    await contact.say(await Service.getNews());
    await contact.say(await Service.getWeather());
  })
})

// Service.getNews
static async getNews() {
    let msg;
    let response;
    try {
      response = await this.get('http://v.juhe.cn/toutiao/index', {
        params: {
          // 需要去https://www.juhe.cn/申请
          key: NEWS_KEY,
        },
      });
      msg = Util.handleNewsData(response);
    } catch (e) {
      console.error(e);
      msg = '获取新闻失败';
    }
    return msg;
}

// Service.getWeather
static async getWeather() {
    let msg;
    let response;
    try {
      response = await this.get(TIANQI_URL, {
        params: {
          cityname: TIANQI_CITY,
          // 需要去https://www.juhe.cn/申请
          key: TIANQI_KEY
        },
      });
      msg = Util.handleWeatherData(response);
    } catch (e) {
      console.error(e);
      msg = '获取天气失败';
    }
    return msg;
  }

```

一个简单的，拥有每日播报，自动聊天的微信机器人就实现了。

完整代码[wechat-boy](https://github.com/zjkhiyori/wechat-boy)
