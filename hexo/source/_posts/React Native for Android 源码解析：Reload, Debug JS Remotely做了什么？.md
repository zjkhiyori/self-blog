---
title: React Native for Android 源码解析：Reload, Debug JS Remotely具体做了什么？
date: 2018-05-15 18:54:54
categories:
  - 技术
tags:
  - React Native
  - Android
---

{% asset_img title_background.jpeg 忽悠妹纸买的splatoon不会玩然后甩给我了，美滋滋 %}

## Reload, debug js remotely罪恶滔天，弄的百姓怨声载道
最近使用0.54.0版本开发有个调试的bug非常恶心，debug js remotely总是抛
```
DeltaPatcher.js:58 Uncaught (in promise) Error: DeltaPatcher should receive a fresh Delta when being initialized
                                                       at DeltaPatcher.applyDelta (DeltaPatcher.js:58)
                                                       at deltaUrlToBlobUrl (deltaUrlToBlobUrl.js:34)
                                                       at <anonymous>
```
想再次debug就得杀掉进程重新打开，官方解释在0.55版本会修复此问题，看了下pr改动都是js代码，随即更新版本修复此问题。若想以后碰到类似框架性的问题，想要自己能有排错纠错能力，还是老老实实啃源码吧

<!-- more -->

## Reload
首先看看Reload，先从`Activity`下手，初始demo里`MainActivity`继承了`ReactActivity`，RN工程的初始化，加载jsbundle的触发都在这个`ReactActivity`中，然后具体业务逻辑又交给了它的代理类`ReactActivityDelegate`，里面做了初始化RN框架逻辑，框架初始化的流程先不管，主要看看reload流程
### onKeyUp
```
public boolean onKeyUp(int keyCode, KeyEvent event) {
    if (getReactNativeHost().hasInstance() && getReactNativeHost().getUseDeveloperSupport()) {
      if (keyCode == KeyEvent.KEYCODE_MENU) {
        getReactNativeHost().getReactInstanceManager().showDevOptionsDialog();
        return true;
      }
      boolean didDoubleTapR = Assertions.assertNotNull(mDoubleTapReloadRecognizer)
        .didDoubleTapR(keyCode, getPlainActivity().getCurrentFocus());
      if (didDoubleTapR) {
        getReactNativeHost().getReactInstanceManager().getDevSupportManager().handleReloadJS();
        return true;
      }
    }
    return false;
  }
```
`ReactActivity`中侦听了物理按键，在keyCode为82即menu按键的时候，获取了RN主要的管理类`ReactInstanceManager`，然后调起了调试框`DevOptionsDialog`，具体业务逻辑在`DevSupportManagerImpl`这个类中，还可以看到有另外一个doubleTapR操作可以直接进行reload jsbundle，继续跟到`DevSupportManagerImpl`中，这里定义了调试dialog，跟到`R.string.catalyst_reloadjs`这个事件，触发了`handleReloadJS`，reload的流程入口就在这个方法中
### handleReloadJS
```
@Override
  public void handleReloadJS() {

    UiThreadUtil.assertOnUiThread();

    ReactMarker.logMarker(
        ReactMarkerConstants.RELOAD,
        mDevSettings.getPackagerConnectionSettings().getDebugServerHost());

    // dismiss redbox if exists
    hideRedboxDialog();

    if (mDevSettings.isRemoteJSDebugEnabled()) {
      PrinterHolder.getPrinter()
          .logMessage(ReactDebugOverlayTags.RN_CORE, "RNCore: load from Proxy");
      mDevLoadingViewController.showForRemoteJSEnabled();
      mDevLoadingViewVisible = true;
      reloadJSInProxyMode();
    } else {
      PrinterHolder.getPrinter()
          .logMessage(ReactDebugOverlayTags.RN_CORE, "RNCore: load from Server");
      String bundleURL =
        mDevServerHelper.getDevServerBundleURL(Assertions.assertNotNull(mJSAppBundleName));
      reloadJSFromServer(bundleURL);
    }
  }
```
可以看到这个方法主要是在取bundleURL，还区分了debug js remotely模式，可以看到这里的`mJSAppBundleName`是在构造函里数获取的，然后构造函数用IDE的函数跳转功能并不能找到在哪里构造的，仔细观察`DevSupportManagerImpl`的接口`DevSupportManager`，可以看到在`DevSupportManagerFactory`这个工厂类中有使用，这里是用的反射进行构造的
```
public static DevSupportManager create(
    Context applicationContext,
    ReactInstanceManagerDevHelper reactInstanceManagerHelper,
    // 这个是mJSAppBundleName
    @Nullable String packagerPathForJSBundleName,
    boolean enableOnCreate,
    @Nullable RedBoxHandler redBoxHandler,
    @Nullable DevBundleDownloadListener devBundleDownloadListener,
    int minNumShakes) {
    if (!enableOnCreate) {
      return new DisabledDevSupportManager();
    }
    try {
      // ProGuard is surprisingly smart in this case and will keep a class if it detects a call to
      // Class.forName() with a static string. So instead we generate a quasi-dynamic string to
      // confuse it.
      String className =
        new StringBuilder(DEVSUPPORT_IMPL_PACKAGE)
          .append(".")
          .append(DEVSUPPORT_IMPL_CLASS)
          .toString();
      Class<?> devSupportManagerClass =
        Class.forName(className);
      Constructor constructor =
        devSupportManagerClass.getConstructor(
          Context.class,
          ReactInstanceManagerDevHelper.class,
          String.class,
          boolean.class,
          RedBoxHandler.class,
          DevBundleDownloadListener.class,
          int.class);
      return (DevSupportManager) constructor.newInstance(
        applicationContext,
        reactInstanceManagerHelper,
        packagerPathForJSBundleName,
        true,
        redBoxHandler,
        devBundleDownloadListener,
        minNumShakes);
    } catch (Exception e) {
      throw new RuntimeException(
        "Requested enabled DevSupportManager, but DevSupportManagerImpl class was not found" +
          " or could not be created",
        e);
    }
  }
```
跟到最后可以发现是在`ReactNativeHost`这个抽象类的`getJSMainModuleName()`方法拿到的，这个方法可以给用户重写进行自定义，再回到`handleReloadJS`方法，拼接出来的bundleURL长这样
`http://localhost:8081/index.delta?platform=android&dev=true&minify=false`，host就是我们本地Nodejs启动的服务器地址
```
public void reloadJSFromServer(final String bundleURL) {
    ReactMarker.logMarker(ReactMarkerConstants.DOWNLOAD_START);

    mDevLoadingViewController.showForUrl(bundleURL);
    mDevLoadingViewVisible = true;

    final BundleDownloader.BundleInfo bundleInfo = new BundleDownloader.BundleInfo();
    // 触发下载任务
    mDevServerHelper.downloadBundleFromURL(
        // 侦听下载
        new DevBundleDownloadListener() {
          @Override
          public void onSuccess() {
            mDevLoadingViewController.hide();
            mDevLoadingViewVisible = false;
            synchronized (DevSupportManagerImpl.this) {
              mBundleStatus.isLastDownloadSucess = true;
              mBundleStatus.updateTimestamp = System.currentTimeMillis();
            }
            if (mBundleDownloadListener != null) {
              mBundleDownloadListener.onSuccess();
            }
            UiThreadUtil.runOnUiThread(
                new Runnable() {
                  @Override
                  public void run() {
                    ReactMarker.logMarker(ReactMarkerConstants.DOWNLOAD_END, bundleInfo.toJSONString());
                    mReactInstanceManagerHelper.onJSBundleLoadedFromServer();
                  }
                });
          }

          @Override
          public void onProgress(@Nullable final String status, @Nullable final Integer done, @Nullable final Integer total) {
            mDevLoadingViewController.updateProgress(status, done, total);
            if (mBundleDownloadListener != null) {
              mBundleDownloadListener.onProgress(status, done, total);
            }
          }

          @Override
          public void onFailure(final Exception cause) {
            mDevLoadingViewController.hide();
            mDevLoadingViewVisible = false;
            synchronized (DevSupportManagerImpl.this) {
              mBundleStatus.isLastDownloadSucess = false;
            }
            if (mBundleDownloadListener != null) {
              mBundleDownloadListener.onFailure(cause);
            }
            FLog.e(ReactConstants.TAG, "Unable to download JS bundle", cause);
            UiThreadUtil.runOnUiThread(
                new Runnable() {
                  @Override
                  public void run() {
                    if (cause instanceof DebugServerException) {
                      DebugServerException debugServerException = (DebugServerException) cause;
                      showNewJavaError(debugServerException.getMessage(), cause);
                    } else {
                      showNewJavaError(
                          mApplicationContext.getString(R.string.catalyst_jsload_error),
                          cause);
                    }
                  }
                });
          }
        },
        mJSBundleTempFile,
        bundleURL,
        bundleInfo);
  }
```
这个方法触发了下载任务和下载成功后续的操作，跟进`mDevServerHelper.downloadBundleFromUR()`方法，走到`BundleDownloader`类的`downloadBundleFromURL`方法
```
public void downloadBundleFromURL(
      final DevBundleDownloadListener callback,
      final File outputFile,
      final String bundleURL,
      final @Nullable BundleInfo bundleInfo) {

    // 实例化okhttp请求
    final Request request =
        new Request.Builder()
            .url(mBundleDeltaClient.toDeltaUrl(bundleURL))
            // FIXME: there is a bug that makes MultipartStreamReader to never find the end of the
            // multipart message. This temporarily disables the multipart mode to work around it,
            // but
            // it means there is no progress bar displayed in the React Native overlay anymore.
            // .addHeader("Accept", "multipart/mixed")
            .build();
    mDownloadBundleFromURLCall = Assertions.assertNotNull(mClient.newCall(request));
    mDownloadBundleFromURLCall.enqueue(
        new Callback() {
          @Override
          public void onFailure(Call call, IOException e) {
            // ignore callback if call was cancelled
            if (mDownloadBundleFromURLCall == null || mDownloadBundleFromURLCall.isCanceled()) {
              mDownloadBundleFromURLCall = null;
              return;
            }
            mDownloadBundleFromURLCall = null;

            callback.onFailure(
                DebugServerException.makeGeneric(
                    "Could not connect to development server.",
                    "URL: " + call.request().url().toString(),
                    e));
          }

          @Override
          public void onResponse(Call call, final Response response) throws IOException {
            // ignore callback if call was cancelled
            if (mDownloadBundleFromURLCall == null || mDownloadBundleFromURLCall.isCanceled()) {
              mDownloadBundleFromURLCall = null;
              return;
            }
            mDownloadBundleFromURLCall = null;

            final String url = response.request().url().toString();

            // Make sure the result is a multipart response and parse the boundary.
            String contentType = response.header("content-type");
            Pattern regex = Pattern.compile("multipart/mixed;.*boundary=\"([^\"]+)\"");
            Matcher match = regex.matcher(contentType);
            try (Response r = response) {
              if (match.find()) {
                processMultipartResponse(
                  url, r, match.group(1), outputFile, bundleInfo, callback);
              } else {
                // In case the server doesn't support multipart/mixed responses, fallback to normal
                // download.
                processBundleResult(
                  url,
                  r.code(),
                  r.headers(),
                  Okio.buffer(r.body().source()),
                  outputFile,
                  bundleInfo,
                  callback);
              }
            }
          }
        });
  }
```
先看看这个方法的形参
* DevBundleDownloadListener callback：jsbundle下载回调
* File outputFile：Bundle缓存地址，我这里具体为
`/data/data/com.socketclientrn/files/ReactNativeDevBundle.js`
* String bundleURL：下载jsbundle的URL

再看函数具体逻辑，内部使用了okhttp进行下载，下载成功后，`onResponse`回调中对返回数据进行了缓存。
```
private void processBundleResult(
      String url,
      int statusCode,
      Headers headers,
      BufferedSource body,
      File outputFile,
      BundleInfo bundleInfo,
      DevBundleDownloadListener callback)
      throws IOException {
    // Check for server errors. If the server error has the expected form, fail with more info.
    if (statusCode != 200) {
      String bodyString = body.readUtf8();
      DebugServerException debugServerException = DebugServerException.parse(bodyString);
      if (debugServerException != null) {
        callback.onFailure(debugServerException);
      } else {
        StringBuilder sb = new StringBuilder();
        sb.append("The development server returned response error code: ").append(statusCode).append("\n\n")
          .append("URL: ").append(url).append("\n\n")
          .append("Body:\n")
          .append(bodyString);
        callback.onFailure(new DebugServerException(sb.toString()));
      }
      return;
    }

    if (bundleInfo != null) {
      populateBundleInfo(url, headers, bundleInfo);
    }

    File tmpFile = new File(outputFile.getPath() + ".tmp");

    boolean bundleUpdated;

    if (BundleDeltaClient.isDeltaUrl(url)) {
      // If the bundle URL has the delta extension, we need to use the delta patching logic.
      bundleUpdated = mBundleDeltaClient.storeDeltaInFile(body, tmpFile);
    } else {
      mBundleDeltaClient.reset();
      bundleUpdated = storePlainJSInFile(body, tmpFile);
    }

    if (bundleUpdated) {
      // If we have received a new bundle from the server, move it to its final destination.
      if (!tmpFile.renameTo(outputFile)) {
        throw new IOException("Couldn't rename " + tmpFile + " to " + outputFile);
      }
    }

    callback.onSuccess();
  }
```
内部具体的流操作使用了okio，具体缓存的时候在参数`outputFile`后面加了个`.tmp`然后进行存储，存储ok后回调`DevBundleDownloadListener`。
再回到`DevSupportManagerImpl`的`reloadJSFromServer`方法，可以在`onSuccess`回调中看到判空`mBundleDownloadListener`然后调用的逻辑，这个回调是初始化`DevSupportManagerImpl`传进来的，调用链跟到最后是在`ReactNativeHost`的`createReactInstanceManager`方法中构建`ReactInstanceManager`时传递的，这个方法开发者是可以重写的，提供给开发者侦听jsbundle下载是否成功与失败

### createCachedBundleFromNetworkLoader
```
private ReactInstanceManagerDevHelper createDevHelperInterface() {
    return new ReactInstanceManagerDevHelper() {
      @Override
      public void onReloadWithJSDebugger(JavaJSExecutor.Factory jsExecutorFactory) {
        ReactInstanceManager.this.onReloadWithJSDebugger(jsExecutorFactory);
      }

      @Override
      public void onJSBundleLoadedFromServer() {
        ReactInstanceManager.this.onJSBundleLoadedFromServer();
      }

      @Override
      public void toggleElementInspector() {
        ReactInstanceManager.this.toggleElementInspector();
      }

      @Override
      public @Nullable Activity getCurrentActivity() {
        return ReactInstanceManager.this.mCurrentActivity;
      }
    };
  }
```
跟着调用链，最后走到了`createCachedBundleFromNetworkLoader`方法里
```
public static JSBundleLoader createCachedBundleFromNetworkLoader(
      final String sourceURL,
      final String cachedFileLocation) {
    return new JSBundleLoader() {
      @Override
      public String loadScript(CatalystInstanceImpl instance) {
        try {
          instance.loadScriptFromFile(cachedFileLocation, sourceURL, false);
          return sourceURL;
        } catch (Exception e) {
          throw DebugServerException.makeGeneric(e.getMessage(), e);
        }
      }
    };
  }
```
`createCachedBundleFromNetworkLoader`构造完`JSBundleLoader`后，就开始调用`CatalystInstanceImpl`去加载jsbundle了，`CatalystInstance`是Java，C，JavaScript三端通信的入口。
```
/* package */ void loadScriptFromFile(String fileName, String sourceURL, boolean loadSynchronously) {
    mSourceURL = sourceURL;
    jniLoadScriptFromFile(fileName, sourceURL, loadSynchronously);
  }

  private native void jniLoadScriptFromFile(String fileName, String sourceURL, boolean loadSynchronously);

```
可以看到最终加载jsbundle是在C里面完成的
### Reload总流程
reload总的流程可以总结为：点击reload -> `DevSupportManagerImpl`拼接URL，触发下载 -> `BundleDownloader`请求服务器下载jsbundle -> 回调`DevSupportManagerImpl` -> 调用`CatalystInstanceImpl`通知C加载新的jsbundle

## Debug JS Remotely
### onKeyUp
先看看Debug JS Remotely的点击事件，
```
options.put(
        remoteJsDebugMenuItemTitle,
        new DevOptionHandler() {
          @Override
          public void onOptionSelected() {
            mDevSettings.setRemoteJSDebugEnabled(!mDevSettings.isRemoteJSDebugEnabled());
            handleReloadJS();
          }
        });
```
先设置反了一下`remote_js_debug`这个key，使用SharedPreference存储，然后就走到`handleReloadJS`方法里
### handleReloadJS
```
if (mDevSettings.isRemoteJSDebugEnabled()) {
      PrinterHolder.getPrinter()
          .logMessage(ReactDebugOverlayTags.RN_CORE, "RNCore: load from Proxy");
      mDevLoadingViewController.showForRemoteJSEnabled();
      mDevLoadingViewVisible = true;
      reloadJSInProxyMode();
    } else {
      PrinterHolder.getPrinter()
          .logMessage(ReactDebugOverlayTags.RN_CORE, "RNCore: load from Server");
      String bundleURL =
        mDevServerHelper.getDevServerBundleURL(Assertions.assertNotNull(mJSAppBundleName));
      reloadJSFromServer(bundleURL);
    }
```
这里区分了debug js remotely模式与普通开发模式，主要看看`reloadJSInProxyMode`方法
```
private void reloadJSInProxyMode() {
    // When using js proxy, there is no need to fetch JS bundle as proxy executor will do that
    // anyway
    mDevServerHelper.launchJSDevtools();

    JavaJSExecutor.Factory factory = new JavaJSExecutor.Factory() {
      @Override
      public JavaJSExecutor create() throws Exception {
        WebsocketJavaScriptExecutor executor = new WebsocketJavaScriptExecutor();
        SimpleSettableFuture<Boolean> future = new SimpleSettableFuture<>();
        executor.connect(
            mDevServerHelper.getWebsocketProxyURL(),
            getExecutorConnectCallback(future));
        // TODO(t9349129) Don't use timeout
        try {
          future.get(90, TimeUnit.SECONDS);
          return executor;
        } catch (ExecutionException e) {
          throw (Exception) e.getCause();
        } catch (InterruptedException | TimeoutException e) {
          throw new RuntimeException(e);
        }
      }
    };
    mReactInstanceManagerHelper.onReloadWithJSDebugger(factory);
  }
```
先调用了`launchJSDevtools`方法，里面仅仅做了一个简单的request，URL为
`http://localhost:8081/launch-js-devtools`，目的应该是打开调试网页，然后实例化了一个实现`JavaJSExecutor.Factory`接口的匿名类，`create`方法会在调用`recreateReactContextInBackground`方法里的子线程中调用，跟进到`connectInternal`方法
```
private void connectInternal(
      String webSocketServerUrl,
      final JSExecutorConnectCallback callback) {
    final JSDebuggerWebSocketClient client = new JSDebuggerWebSocketClient();
    final Handler timeoutHandler = new Handler(Looper.getMainLooper());
    client.connect(
        webSocketServerUrl, new JSDebuggerWebSocketClient.JSDebuggerCallback() {
          // It's possible that both callbacks can fire on an error so make sure we only
          // dispatch results once to our callback.
          private boolean didSendResult = false;

          @Override
          public void onSuccess(@Nullable String response) {
            client.prepareJSRuntime(
                new JSDebuggerWebSocketClient.JSDebuggerCallback() {
                  @Override
                  public void onSuccess(@Nullable String response) {
                    timeoutHandler.removeCallbacksAndMessages(null);
                    mWebSocketClient = client;
                    if (!didSendResult) {
                      callback.onSuccess();
                      didSendResult = true;
                    }
                  }

                  @Override
                  public void onFailure(Throwable cause) {
                    timeoutHandler.removeCallbacksAndMessages(null);
                    if (!didSendResult) {
                      callback.onFailure(cause);
                      didSendResult = true;
                    }
                  }
                });
          }

          @Override
          public void onFailure(Throwable cause) {
            timeoutHandler.removeCallbacksAndMessages(null);
            if (!didSendResult) {
              callback.onFailure(cause);
              didSendResult = true;
            }
          }
        });
    timeoutHandler.postDelayed(
        new Runnable() {
          @Override
          public void run() {
            client.closeQuietly();
            callback.onFailure(
                new WebsocketExecutorTimeoutException(
                    "Timeout while connecting to remote debugger"));
          }
        },
        CONNECT_TIMEOUT_MS);
  }
```
这里使用了websocket与本地服务器进行连接，服务器URL为：
`ws://localhost:8081/debugger-proxy?role=client`，
继续跟到`JSDebuggerWebSocketClient`的`connect`方法
```
public void connect(String url, JSDebuggerCallback callback) {
    if (mHttpClient != null) {
      throw new IllegalStateException("JSDebuggerWebSocketClient is already initialized.");
    }
    mConnectCallback = callback;
    mHttpClient = new OkHttpClient.Builder()
      .connectTimeout(10, TimeUnit.SECONDS)
      .writeTimeout(10, TimeUnit.SECONDS)
      .readTimeout(0, TimeUnit.MINUTES) // Disable timeouts for read
      .build();

    Request request = new Request.Builder().url(url).build();
    mHttpClient.newWebSocket(request, this);
  }
```
这里是使用okhttp来和本地服务器进行长连接，建立起连接后可以看到`JSDebuggerWebSocketClient`里`onMessage`，`sendMessage`方法与服务器通信的逻辑。这里我们先回到`reloadJSInProxyMode`方法，跟到`onReloadWithJSDebugger`方法
```
private void onReloadWithJSDebugger(JavaJSExecutor.Factory jsExecutorFactory) {
    Log.d(ReactConstants.TAG, "ReactInstanceManager.onReloadWithJSDebugger()");
    recreateReactContextInBackground(
        new ProxyJavaScriptExecutor.Factory(jsExecutorFactory),
        JSBundleLoader.createRemoteDebuggerBundleLoader(
            mDevSupportManager.getJSBundleURLForRemoteDebugging(),
            mDevSupportManager.getSourceUrl()));
  }
```
这里逻辑与普通debug模式差不多，都是构造`JSBundleLoader`和`JavaScriptExecutorFactory`，跟到`createRemoteDebuggerBundleLoader`方法中
### createRemoteDebuggerBundleLoader
```
/**
   * This loader is used when proxy debugging is enabled. In that case there is no point in fetching
   * the bundle from device as remote executor will have to do it anyway.
   */
  public static JSBundleLoader createRemoteDebuggerBundleLoader(
      final String proxySourceURL,
      final String realSourceURL) {
    return new JSBundleLoader() {
      @Override
      public String loadScript(CatalystInstanceImpl instance) {
        instance.setSourceURLs(realSourceURL, proxySourceURL);
        return realSourceURL;
      }
    };
  }

 /**
   * This API is used in situations where the JS bundle is being executed not on
   * the device, but on a host machine. In that case, we must provide two source
   * URLs for the JS bundle: One to be used on the device, and one to be used on
   * the remote debugging machine.
   *
   * @param deviceURL A source URL that is accessible from this device.
   * @param remoteURL A source URL that is accessible from the remote machine
   * executing the JS.
   */
  /* package */ void setSourceURLs(String deviceURL, String remoteURL) {
    mSourceURL = deviceURL;
    jniSetSourceURL(remoteURL);
  }
```
可以从注释中看出，此时jsbundle也是从本地服务器下载的

跳出逻辑看看JSBundleLoader，暴露了四个方法
 * `createAssetLoader` 从asset目录中创建loader
 * `createFileLoader` 从具体某个文件中创建loader
 * `createCachedBundleFromNetworkLoader` 从URL中加载
 * `createRemoteDebuggerBundleLoader` 同上

 所以加载JSBundle可以归类为以上三种方式

## finally
开头的问题是js层面的，好像跟我分析的Java层并没什么卵关系。。