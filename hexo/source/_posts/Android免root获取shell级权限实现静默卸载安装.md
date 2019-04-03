---
title: Android免root获取shell级权限实现静默卸载安装
date: 2019-04-03 12:16:20
categories:
  - 技术
tags:
  - Android
---

## 方案分析
市面上实现这种方案最早的应用应该是"黑阈"，我们在使用的时候需要开启调试模式，然后通过adb或者注入器注入主服务，才可以使用后台管制以及其他高级权限的功能。所以本方案也是基于这种注入服务的方式，来实现各种需要高级权限的功能

## Shell级权限的服务
这种方案的关键点是这个拥有shell级权限的服务，Android提供了app_process指令供我们启动一个进程，我们可以通过该指令起一个Java服务，如果是通过shell执行的，该服务会从`/system/bin/sh` fork出来，并且拥有shell级权限

<!-- more -->

这里我写了一个service.dex服务来测试一下，并通过shell启动它
```
// 先将service.dex push至Android设备
adb push service.dex /data/local/tmp/

// 然后通过app_process启动，并指定一个名词
adb shell nohup app_process -Djava.class.path=/data/local/tmp/server.dex /system/bin --nice-name=club.syachiku.hackrootservice shellService.Main
```
然后再看看该服务的信息
```
// 列出所有正在运行的服务
adb shell ps

// 找到服务名为club.syachiku.hackrootservice的服务
shell     24154 1     777484 26960 ffffffff b6e7284c S club.syachiku.hackrootservice
```
可以看到该服务pid为24154，ppid为1，也说明该服务是从`/system/bin/sh` fork出来的
```
// 查看该服务具体信息
adb shell cat /proc/24154/status

Name:	main
State:	S (sleeping)
Tgid:	24154
Pid:	24154
PPid:	1
TracerPid:	0
Uid:	2000	2000	2000	2000
Gid:	2000	2000	2000	2000
FDSize:	32
Groups:	1004 1007 1011 1015 1028 3001 3002 3003 3006
VmPeak:	  777484 kB
VmSize:	  777484 kB
VmLck:	       0 kB
VmPin:	       0 kB
VmHWM:	   26960 kB
VmRSS:	   26960 kB
VmData:	   11680 kB
VmStk:	    8192 kB
VmExe:	      12 kB
VmLib:	   52812 kB
VmPTE:	     134 kB
VmSwap:	       0 kB
Threads:	13
SigQ:	0/6947
SigPnd:	0000000000000000
ShdPnd:	0000000000000000
SigBlk:	0000000000001204
SigIgn:	0000000000000001
SigCgt:	00000002000094f8
CapInh:	0000000000000000
CapPrm:	0000000000000000
CapEff:	0000000000000000
CapBnd:	00000000000000c0
Seccomp:	0
Cpus_allowed:	f
Cpus_allowed_list:	0-3
voluntary_ctxt_switches:	18
nonvoluntary_ctxt_switches:	76
```
可以看到Uid，Gid为2000，就是shell的Uid

## 开始吧(本方案也需开启调试模式)
分析了app_process的可行性，我们可以给出一个方案，通过app_process启动一个socket服务，然后让我们的App与该服务通信，来代理App做一些~~见不得人~~需要shell级权限的事情，比如静默卸载，安装，全局广播等等

### 新建工程
这里我们新建一个名为hack-root的工程

### 编写socket服务
然后在代码目录下新建一个shellService包，新建一个Main入口类，我们先输出一些测试代码，来测试是否执行成功

```
public class Main {
    public static void main(String[] args) {
        System.out.println("*****************hack server starting****************");
    }
}
```

* 首先执行./gradlew buildDebug打包，然后.apk改成.rar解压出classes.dex文件，然后将该文件push至你的Android设备比如/sdcard/
* 然后使用app_process指令执行该服务
  ```
  adb shell app_process -Djava.class.path=/sdcard/classes.dex /system/bin shellService.Main
  ```
* 如果控制台输出`Abort`应该是一些基本的路径问题，稍作仔细检查一下，成功执行后会看到我们的打印的日志

运行测试没问题了就开写socket服务吧
```
public class Main {
    public static void main(String[] args) {
        // 利用looper让线程循环
        Looper.prepareMainLooper();
        System.out.println("*****************hack server starting****************");
        // 开一个子线程启动服务
        new Thread(new Runnable() {
            @Override
            public void run() {
                new SocketService(new SocketService.SocketListener() {
                    @Override
                    public String onMessage(String msg) {
                        // 接收客户端传过来的消息
                        return resolveMsg(msg);
                    }
                });
            }
        }).start();
        Looper.loop();
    }

    private static String resolveMsg(String msg) {
        // 执行客户端传过来的消息并返回执行结果
        ShellUtil.ExecResult execResult =
                ShellUtil.execute("pm uninstall " + msg);
        return execResult.getMessage();
    }
}
```

SocketServer
```
public class SocketService {
    private final int PORT = 10500;
    private SocketListener listener;

    public SocketService(SocketListener listener) {
        this.listener = listener;
        try {
            // 利用ServerSocket类启动服务，然后指定一个端口
            ServerSocket serverSocket = new ServerSocket(PORT);
            System.out.println("server running " + PORT + " port");
            ArrayBlockingQueue<Runnable> queue = new ArrayBlockingQueue<>(10);
            // 新建一个线程池用来并发处理客户端的消息
            ThreadPoolExecutor executor = new ThreadPoolExecutor(
                    5,
                    10,
                    5000,
                    TimeUnit.MILLISECONDS,
                    queue
                    );
            while (true) {
                Socket socket = serverSocket.accept();
                // 接收到新消息
                executor.execute(new processMsg(socket));
            }
        } catch (Exception e) {
            System.out.println("SocketServer create Exception:" + e);
        }
    }

    class processMsg implements Runnable {
        Socket socket;

        public processMsg(Socket s) {
            socket = s;
        }

        public void run() {
            try {
                // 通过流读取内容
                BufferedReader bufferedReader = new BufferedReader(new InputStreamReader(socket.getInputStream()));
                String line = bufferedReader.readLine();
                System.out.println("server receive: " + line);
                PrintWriter printWriter = new PrintWriter(socket.getOutputStream());
                String repeat = listener.onMessage(line);
                System.out.println("server send: " + repeat);
                // 服务端返回给客户端的消息
                printWriter.print(repeat);
                printWriter.flush();
                printWriter.close();
                bufferedReader.close();
                socket.close();
            } catch (IOException e) {
                System.out.println("socket connection error：" + e.toString());
            }
        }
    }

    public interface SocketListener{
        // 通话消息回调
        String onMessage(String text);
    }
}
```

ShellUtil

```
public class ShellUtil {
    private static final String COMMAND_LINE_END = "\n";
    private static final String COMMAND_EXIT = "exit\n";

    // 单条指令
    public static ExecResult execute(String command) {
        return execute(new String[] {command});
    }

    // 多条指令重载方法
    private static ExecResult execute(String[] commands) {
        if (commands == null || commands.length == 0) {
            return new ExecResult(false, "empty command");
        }
        int result = -1;
        Process process = null;
        DataOutputStream dataOutputStream = null;
        BufferedReader sucResult = null, errResult = null;
        StringBuilder sucMsg = null, errMsg = null;

        try {
            // 获取shell级别的process
            process = Runtime.getRuntime().exec("sh");
            dataOutputStream = new DataOutputStream(process.getOutputStream());
            for (String command : commands) {
                if (command == null) continue;
                System.out.println("execute command: " + command);
                // 执行指令
                dataOutputStream.write(command.getBytes());
                dataOutputStream.writeBytes(COMMAND_LINE_END);
                // 刷新
                dataOutputStream.flush();
            }
            dataOutputStream.writeBytes(COMMAND_EXIT);
            dataOutputStream.flush();
            result = process.waitFor();
            sucMsg = new StringBuilder();
            errMsg = new StringBuilder();
            sucResult = new BufferedReader(new InputStreamReader(process.getInputStream()));
            errResult = new BufferedReader(new InputStreamReader(process.getErrorStream()));
            String s;
            while ((s = sucResult.readLine()) != null) {
                sucMsg.append(s);
            }
            while ((s = errResult.readLine()) != null) {
                errMsg.append(s);
            }

        } catch (IOException | InterruptedException e) {
            e.printStackTrace();
        } finally {
            try {
                // 关闭资源，防止内存泄漏
                assert dataOutputStream != null;
                dataOutputStream.close();
                assert sucResult != null;
                sucResult.close();
                assert errResult != null;
                errResult.close();
            } catch (IOException e) {
                e.printStackTrace();
            }
            process.destroy();
        }
        ExecResult execResult;
        if (result == 0) {
            execResult = new ExecResult(true, sucMsg.toString());
        } else {
            execResult = new ExecResult(false, errMsg.toString());
        }
        // 返回执行结果
        return execResult;
    }

    public static class ExecResult {
        private boolean success;
        private String message;

        public ExecResult(boolean success, String message) {
            this.success = success;
            this.message = message;
        }

        public boolean getSuccess() {
            return this.success;
        }

        public String getMessage() {
            return this.message;
        }
    }
}
```

一个简易的socket服务就搭建好了，可以用来接收客户端传过来的指令并且执行然后返回结果

### 编写客户端

首先编写一个socketClient

```
public class SocketClient {
    private final String TAG = "HackRoot SocketClient";
    private final int PORT = 10500;
    private SocketListener listener;
    private PrintWriter printWriter;

    public SocketClient(final String cmd, SocketListener listener) {
        this.listener = listener;
        new Thread(new Runnable() {
            @Override
            public void run() {
                Socket socket = new Socket();
                try {
                    // 与hackserver建立连接
                    socket.connect(new InetSocketAddress("127.0.0.1", PORT), 3000);
                    socket.setSoTimeout(3000);
                    printWriter = new PrintWriter(socket.getOutputStream(), true);
                    Log.d(TAG, "client send: " + cmd);
                    // 发送指令
                    printWriter.println(cmd);
                    printWriter.flush();
                    // 读取服务端返回
                    readServerData(socket);
                } catch (IOException e) {
                    Log.d(TAG, "client send fail: " + e.getMessage());
                    e.printStackTrace();
                }
            }
        }).start();
    }

    private void readServerData(final Socket socket) {
        try {
            InputStreamReader ipsReader = new InputStreamReader(socket.getInputStream());
            BufferedReader bfReader = new BufferedReader(ipsReader);
            String line = null;
            while ((line = bfReader.readLine()) != null) {
                Log.d(TAG, "client receive: " + line);
                listener.onMessage(line);
            }
            // 释放资源
            ipsReader.close();
            bfReader.close();
            printWriter.close();
            socket.close();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    interface SocketListener {
        void onMessage(String msg);
    }
}
```

然后UI组件相关的事件，我们暂时只实现一个静默卸载App的功能
```
public class MainActivity extends AppCompatActivity {
    private TextView textView;
    private ScrollView scrollView;
    private EditText uninsTxtInput;
    private Button btnUnins;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        btnUnins = findViewById(R.id.btn_uninstall);
        uninsTxtInput = findViewById(R.id.pkg_input);
        textView = findViewById(R.id.tv_output);
        scrollView = findViewById(R.id.text_container);
        btnUnins.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                sendMessage(uninsTxtInput.getText().toString());
            }
        });
    }

    private void sendMessage(String msg) {
        new SocketClient(msg, new SocketClient.SocketListener() {
            @Override
            public void onMessage(String msg) {
                showOnTextView(msg);
            }
        });
    }

    private void showOnTextView(final String msg) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                String baseText = textView.getText().toString();
                if (baseText != null) {
                    textView.setText(baseText + "\n" + msg);
                } else {
                    textView.setText(msg);
                }
                scrollView.smoothScrollTo(0, scrollView.getHeight());
            }
        });
    }
}
```

布局代码
```
<?xml version="1.0" encoding="utf-8"?>
<android.support.constraint.ConstraintLayout xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    xmlns:tools="http://schemas.android.com/tools"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    tools:context=".MainActivity">

    <EditText
        android:id="@+id/pkg_input"
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_marginEnd="8dp"
        android:layout_marginStart="8dp"
        android:layout_marginTop="8dp"
        android:hint="input package name"
        app:layout_constraintEnd_toStartOf="@+id/btn_uninstall"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintTop_toTopOf="parent" />

    <Button
        android:id="@+id/btn_uninstall"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginEnd="8dp"
        android:layout_marginTop="8dp"
        android:text="uninstall"
        app:layout_constraintEnd_toEndOf="parent"
        app:layout_constraintTop_toTopOf="parent" />

    <ScrollView
        android:id="@+id/text_container"
        android:layout_width="0dp"
        android:layout_height="0dp"
        android:layout_marginBottom="8dp"
        android:layout_marginEnd="8dp"
        android:padding="10dp"
        app:layout_constraintBottom_toBottomOf="parent"
        app:layout_constraintEnd_toEndOf="parent"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintTop_toBottomOf="@+id/pkg_input">
        <TextView
            android:id="@+id/tv_output"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content" />
    </ScrollView>
</android.support.constraint.ConstraintLayout>
```

代码相关的工作基本完工，一个简单的，实现了静默卸载Demo就完成了

### 打包测试
重复开头的操作进行打包以及提取.dex文件，然后通过app_process启动服务，运行App输入包名，就可以随意卸载任意App

## 完整项目
[https://github.com/zjkhiyori/hack-root](https://github.com/zjkhiyori/hack-root) 欢迎fork || star

{% asset_img example.gif example %}

## 技术参考
感谢下列开源作者

[android-common](https://github.com/Trinea/android-common)

[Fairy](https://github.com/Zane96/Fairy)

[app_process-shell-use](https://github.com/gtf35/app_process-shell-use)
