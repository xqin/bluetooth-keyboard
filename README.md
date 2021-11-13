
# Remoboard

https://remoboard.github.io/


Remoboard Client Nodejs version(bluetooth connect mode).



## Usage:

```

npm install -g github:xqin/bluetooth-keyboard

blkeyboard

blkeyboard [deviceName]

```


> To enable bluetooth, go to "System Preferences" —> "Security & Privacy" —> "Bluetooth" -> Add your terminal into allowed apps.


> PS: only test in: macOS


## 测试场景

* 本机蓝牙未开启.
  > 会走到 stateChange 中的 poweredOff.
* 本机打开蓝牙, 未找到目标蓝牙设备(目标未开启蓝牙).
  > 会走到 stateChange 中的 poweredOn, 并开启一个延时3秒的 scanTimer, 当 timer 被触发时, 认为查找超时, 会自动退出.
* 本机打开, 目标也打开, 但没有切换到键盘.
  > 可以找到匹配的设备, 但因为 键盘未呼出, 调用 write 发出去的数据, 不会触发 callback, 会走到 timeout 的流程, 执行 peripheral.disconnect, 走重试(重新扫描)的流程.
* 本地打开, 目标也打开, 键盘处于打开状态.
  > 执行四次 发送 ping 的操作, 四次均成功后, 认为连接稳定, 显示 🌈, 并开启 轮询 发送 ping 的流程.
* 本地打开, 目标也打开, 键盘处于打开状态, 连接成功后, 键盘消失.
  > 键盘消失后, 大概在 最开始的6/7 秒的时间内, write 还是可以成功的, 在此之后, 会因为 write 不成功, 而自动走 连接断开重试的逻辑. 如果最终重试 5 次后, 仍然不能走到正常的流程, 则程序会退出.
* 当同时有多个配对成功, 且键盘处于打开状态下的设备连接成功时, 可以同时向这些设备输入内容, 也可以通过 传递 deviceName 来限制, 只与对应的手机进行配对.