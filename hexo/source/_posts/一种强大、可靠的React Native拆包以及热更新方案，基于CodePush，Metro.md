---
title: 一种强大、可靠的React Native拆包以及热更新方案，基于CodePush，Metro
date: 2019-09-29 18:57:14
categories:
  - 技术
tags:
  - React Native
  - Android
---

## 背景需求
因为需要将各业务线通过划分jsbundle的形式进行分离，以达到
* 各个业务包独立更新、回滚以及版本管控
* 增量加载，优化启动速度
* 优化增量更新，只对单独某一业务包增量更新

## 案例参考 
参考了携程以及各种网络版本的做法，大致总结为三种

<!-- more -->

* 修改RN打包脚本，使其支持打包时生成基础包以及业务包，并合理分配moduleID（携程方案）
  * 优点：定制化高，性能优化好，可以做到增量加载
  * 缺点：维护成本高，对RN源码侵入性大，兼容性差
* 不修改打包脚本，纯粹通过diff工具来拆分基础包与业务包，加载前再粘合起来然后加载
  * 优点：简易便于维护，开发量小，不需要更改RN源码
  * 缺点：定制化弱，对性能有一定影响，无法增量加载
* 基于Metro配置来自定义生成的ModuleId，以达到拆分基础，业务包目的
  * 优点：维护成本低，不需要更改RN打包源码，兼容性好
  * 缺点：暂未发现
  
综上所述，js端的bundle拆分用第三种方案最优

## JSBundle拆分
因为Metro官方文档过于简陋，实在看不懂，所以借鉴了一些使用Metro的项目

比如（感谢开原作者的贡献）：https://github.com/smallnew/react-native-multibundler

这个项目较为完整，简要配置下就可以直接使用，所以js端拆包主要参考自这个项目，通过配置Metro的createModuleIdFactory，processModuleFilter回调，我们可以很容易的自定义生成moduleId，以及筛选基础包内容，来达到基础业务包分离的目的，因为实际上拆分jsbundle主要工作也就在于moduleId分配以及打包filter配置，我们可以观察下打包后的js代码结构

通过`react-native bundle --platform android --dev false --entry-file index.common.js --bundle-output ./CodePush/common.android.bundle.js --assets-dest ./CodePush --config common.bundle.js --minify false`指令打出基础包（minify设为false便于查看打包后源码）

```
function (global) {
  "use strict";

  global.__r = metroRequire;
  global.__d = define;
  global.__c = clear;
  global.__registerSegment = registerSegment;
  var modules = clear();
  var EMPTY = {};
  var _ref = {},
      hasOwnProperty = _ref.hasOwnProperty;

  function clear() {
    modules = Object.create(null);
    return modules;
  }

  function define(factory, moduleId, dependencyMap) {
    if (modules[moduleId] != null) {
      return;
    }

    modules[moduleId] = {
      dependencyMap: dependencyMap,
      factory: factory,
      hasError: false,
      importedAll: EMPTY,
      importedDefault: EMPTY,
      isInitialized: false,
      publicModule: {
        exports: {}
      }
    };
  }

  function metroRequire(moduleId) {
    var moduleIdReallyIsNumber = moduleId;
    var module = modules[moduleIdReallyIsNumber];
    return module && module.isInitialized ? module.publicModule.exports : guardedLoadModule(moduleIdReallyIsNumber, module);
  }
```
这里主要看`__r`，`__d`两个变量，赋值了两个方法`metroRequire`，`define`，具体逻辑也很简单，`define`相当于在表中注册，`require`相当于在表中查找，js代码中的`import`，`export`编译后就就转换成了`__d`与`__r`，再观察一下原生Metro代码的`node_modules/metro/src/lib/createModuleIdFactory.js`文件，代码为：
```
function createModuleIdFactory() {
  const fileToIdMap = new Map();
  let nextId = 0;
  return path => {
    let id = fileToIdMap.get(path);

    if (typeof id !== "number") {
      id = nextId++;
      fileToIdMap.set(path, id);
    }

    return id;
  };
}

module.exports = createModuleIdFactory;
```
逻辑比较简单，如果查到map里没有记录这个模块则id自增，然后将该模块记录到map中，所以从这里可以看出，官方代码生成moduleId的规则就是自增，所以这里要替换成我们自己的配置逻辑，我们要做拆包就需要保证这个id不能重复，但是这个id只是在打包时生成，如果我们单独打业务包，基础包，这个id就会丢失，所以对于id的处理，我们还是可以参考上述开源项目，进行每个包有十万位间隔空间的划分，又或者通过每个模块自己的路径或者uuid等去分配，来避免碰撞，但是字符串会增大包的体积，这里不推荐这种做法。所以总结起来js端拆包还是比较容易的，这里就不再赘述

## CodePush改造(代码为Android端，iOS端类似)
用过CodePush的同学都能感受到它强大的功能以及稳定的表现，更新，回滚，强更，环境管控，版本管控等等功能，越用越香，但是它不支持拆包更新，如果自己重新实现一套功能类似的代价较大，所以我尝试通过改造来让它支持多包独立更新，来满足我们拆包的也无需求，改造原则：
* 尽量不入侵其单个包更新的流程
* 基于现有的逻辑基础增加多包更新的能力，不会对其原本流程做更改

通过阅读源码，我们可以发现，只要隔离了包下载的路径以及每个包自己的状态信息文件，然后对多包并发更新时，做一些同步处理，就可以做到多包独立更新

![](https://user-gold-cdn.xitu.io/2019/9/29/16d7c673afd6d353?w=477&h=263&f=png&s=28264)
改造后的包存放路径如上图所示

app.json文件存放包的信息，由检测更新的接口返回以及本地逻辑写入的一些信息，比如hash值，下载url，更新包的版本号，bundle的相对路径(本地代码写入)等等

codepush.json会记录当前包的hash值以及上一个包的hash值，用于回滚，所以正常来讲一个包会有两个版本，上一版本用于备份回滚，回滚成功后会删除掉当前版本，具体逻辑可以自行阅读了解，所以我这里总结一下改动
### Native改动：
主要改动为增加pathPrefix和bundleFileName两个传参，用于分离bundle下载的路径

增加了bundleFileName和pathPrefix参数的方法有

* downloadUpdate(final ReadableMap updatePackage, final boolean notifyProgress, String pathPrefix, String bundleFileName)  
* getUpdateMetadata(String pathPrefix, String bundleFileName, final int updateState)
* getNewStatusReport(String pathPrefix, String bundleFileName) {
* installUpdate(final ReadableMap updatePackage, final int installMode, final int minimumBackgroundDuration, String pathPrefix, String bundleFileName)
* restartApp(boolean onlyIfUpdateIsPending, String pathPrefix, String bundleFileName)
* downloadAndReplaceCurrentBundle(String remoteBundleUrl, String pathPrefix, String bundleFileName) (该方法未使用)

只增加了pathPrefix参数的方法有
* isFailedUpdate(String packageHash, String pathPrefix)
* getLatestRollbackInfo(String pathPrefix)
* setLatestRollbackInfo(String packageHash, String pathPrefix)
* isFirstRun(String packageHash, String pathPrefix)
* notifyApplicationReady(String pathPrefix)
* recordStatusReported(ReadableMap statusReport, String pathPrefix)
* saveStatusReportForRetry(ReadableMap statusReport, String pathPrefix)
* clearUpdates(String pathPrefix) (该方法未使用)

### 对更新包状态管理的改动
因为官方代码只对单个包状态做管理，所以这里我们要改为支持对多个包状态做管理


* sIsRunningBinaryVersion：标识当前是否运行的初始包（未更新），改成用数组或者map记录
* sNeedToReportRollback：标识当前包是否需要汇报回滚，改动如上
* 一些持久化存储的key，需要增加pathPrefix字段来标识是哪一个包的key
 
### 对初始ReactRootView的改动
因为拆包后，对包的加载是增量的，所以我们在初始化业务场景A的ReactRootView时，增量加载业务A的jsbundle，其他业务场景同理，获取业务A jsbundle路径需要借助改造后的CodePush方法，通过传入bundleFileName，pathPrefix
* CodePush.getJSBundleFile("buz.android.bundle.js", "Buz1")

### 对包加载流程的改动
官方代码为加载完bundle即重新创建整个RN环境，拆包后此种方法不可取，如果业务包更新完后，重新加载业务包然后再重建RN环境，会导致基础包代码丢失而报错，所以增加一个只加载jsbundle，不重建RN环境的方法，在更新业务包的时候使用

比如官方更新代码为：

CodePushNativeModule#loadBundle方法
```
private void loadBundle(String pathPrefix, String bundleFileName) {
    try {
        // #1) Get the ReactInstanceManager instance, which is what includes the
        //     logic to reload the current React context.
        final ReactInstanceManager instanceManager = resolveInstanceManager();
        if (instanceManager == null) {
            return;
        }
    
        String latestJSBundleFile = mCodePush.getJSBundleFileInternal(bundleFileName, pathPrefix);
    
        // #2) Update the locally stored JS bundle file path
        setJSBundle(instanceManager, latestJSBundleFile);
    
        // #3) Get the context creation method and fire it on the UI thread (which RN enforces)
        new Handler(Looper.getMainLooper()).post(new Runnable() {
            @Override
            public void run() {
                try {
                    // We don't need to resetReactRootViews anymore
                    // due the issue https://github.com/facebook/react-native/issues/14533
                    // has been fixed in RN 0.46.0
                    //resetReactRootViews(instanceManager);
    
                    instanceManager.recreateReactContextInBackground();
                    mCodePush.initializeUpdateAfterRestart(pathPrefix);
                } catch (Exception e) {
                    // The recreation method threw an unknown exception
                    // so just simply fallback to restarting the Activity (if it exists)
                    loadBundleLegacy();
                }
            }
        });
    
    } catch (Exception e) {
        // Our reflection logic failed somewhere
        // so fall back to restarting the Activity (if it exists)
        CodePushUtils.log("Failed to load the bundle, falling back to restarting the Activity (if it exists). " + e.getMessage());
        loadBundleLegacy();
    }
}
```
改造为业务包增量加载，基础包才重建ReactContext
```
if ("CommonBundle".equals(pathPrefix)) {
                new Handler(Looper.getMainLooper()).post(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            // We don't need to resetReactRootViews anymore
                            // due the issue https://github.com/facebook/react-native/issues/14533
                            // has been fixed in RN 0.46.0
                            //resetReactRootViews(instanceManager);

                            instanceManager.recreateReactContextInBackground();
                            mCodePush.initializeUpdateAfterRestart(pathPrefix);
                        } catch (Exception e) {
                            // The recreation method threw an unknown exception
                            // so just simply fallback to restarting the Activity (if it exists)
                            loadBundleLegacy();
                        }
                    }
                });
            } else {
                JSBundleLoader latestJSBundleLoader;
                if (latestJSBundleFile.toLowerCase().startsWith("assets://")) {
                    latestJSBundleLoader = JSBundleLoader.createAssetLoader(getReactApplicationContext(), latestJSBundleFile, false);
                } else {
                    latestJSBundleLoader = JSBundleLoader.createFileLoader(latestJSBundleFile);
                }
                CatalystInstance catalystInstance = resolveInstanceManager().getCurrentReactContext().getCatalystInstance();
                latestJSBundleLoader.loadScript(catalystInstance);
                mCodePush.initializeUpdateAfterRestart(pathPrefix);
            }
```
启动业务ReactRootView时增量加载jsbundle的逻辑同上

### 对JS端的改动
* CodePush.sync(options): options增加bundleFileName，pathPrefix参数，由业务代码传递进来然后传递给native
* 将上述参数涉及到的方法，改造成能够传递给Native method
* CodePush.sync方法官方不支持多包并发，碰到有重复的sync请求会将重复的丢弃，这里我们需要用一个队列将这些重复的任务管理起来，排队执行（为了简易安全，暂时不做并行更新，尽量改造成串行更新）

CodePush#sync代码
```
const sync = (() => {
  let syncInProgress = false;
  const setSyncCompleted = () => { syncInProgress = false; };
  return (options = {}, syncStatusChangeCallback, downloadProgressCallback, handleBinaryVersionMismatchCallback) => {
    let syncStatusCallbackWithTryCatch, downloadProgressCallbackWithTryCatch;
    if (typeof syncStatusChangeCallback === "function") {
      syncStatusCallbackWithTryCatch = (...args) => {
        try {
          syncStatusChangeCallback(...args);
        } catch (error) {
          log(`An error has occurred : ${error.stack}`);
        }
      }
    }

    if (typeof downloadProgressCallback === "function") {
      downloadProgressCallbackWithTryCatch = (...args) => {
        try {
          downloadProgressCallback(...args);
        } catch (error) {
          log(`An error has occurred: ${error.stack}`);
        }
      }
    }

    if (syncInProgress) {
      typeof syncStatusCallbackWithTryCatch === "function"
        ? syncStatusCallbackWithTryCatch(CodePush.SyncStatus.SYNC_IN_PROGRESS)
        : log("Sync already in progress.");
      return Promise.resolve(CodePush.SyncStatus.SYNC_IN_PROGRESS);
    }

    syncInProgress = true;
    const syncPromise = syncInternal(options, syncStatusCallbackWithTryCatch, downloadProgressCallbackWithTryCatch, handleBinaryVersionMismatchCallback);
    syncPromise
      .then(setSyncCompleted)
      .catch(setSyncCompleted);

    return syncPromise;
  };
})();
```
改造后
```
const sync = (() => {
  let syncInProgress = false;
  //增加一个管理并发任务的队列
  let syncQueue = [];
  const setSyncCompleted = () => {
    syncInProgress = false;
    回调完成后执行队列里的任务
    if (syncQueue.length > 0) {
      log(`Execute queue task, current queue: ${syncQueue.length}`);
      let task = syncQueue.shift(1);
      sync(task.options, task.syncStatusChangeCallback, task.downloadProgressCallback, task.handleBinaryVersionMismatchCallback)
    }
  };

  return (options = {}, syncStatusChangeCallback, downloadProgressCallback, handleBinaryVersionMismatchCallback) => {
    let syncStatusCallbackWithTryCatch, downloadProgressCallbackWithTryCatch;
    if (typeof syncStatusChangeCallback === "function") {
      syncStatusCallbackWithTryCatch = (...args) => {
        try {
          syncStatusChangeCallback(...args);
        } catch (error) {
          log(`An error has occurred : ${error.stack}`);
        }
      }
    }

    if (typeof downloadProgressCallback === "function") {
      downloadProgressCallbackWithTryCatch = (...args) => {
        try {
          downloadProgressCallback(...args);
        } catch (error) {
          log(`An error has occurred: ${error.stack}`);
        }
      }
    }

    if (syncInProgress) {
      typeof syncStatusCallbackWithTryCatch === "function"
        ? syncStatusCallbackWithTryCatch(CodePush.SyncStatus.SYNC_IN_PROGRESS)
        : log("Sync already in progress.");
      //检测到并发任务，放入队列排队
      syncQueue.push({
        options,
        syncStatusChangeCallback,
        downloadProgressCallback,
        handleBinaryVersionMismatchCallback
      });
      log(`Enqueue task, current queue: ${syncQueue.length}`);
      return Promise.resolve(CodePush.SyncStatus.SYNC_IN_PROGRESS);
    }

    syncInProgress = true;
    const syncPromise = syncInternal(options, syncStatusCallbackWithTryCatch, downloadProgressCallbackWithTryCatch, handleBinaryVersionMismatchCallback);
    syncPromise
      .then(setSyncCompleted)
      .catch(setSyncCompleted);

    return syncPromise;
  };
})();
```

* notifyApplicationReady: 官方代码这个方法只会执行一次，主要用于更新之前初始化一些参数，然后缓存结果，后续调用直接返回缓存结果，所以这里我们要改造成不缓存结果，每次都执行


## 后续 
该方案主流程已经ok，多包并发更新，单包独立更新基本没有问题，现在还在边界场景以及压力测试当中，待方案健壮后再上源码做详细分析
