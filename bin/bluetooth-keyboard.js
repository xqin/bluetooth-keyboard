#!/usr/bin/env node

const SERVICE_UUID = '81DA3FD1-7E10-41C1-B16F-4430B506CDE8'
const CHARACTERISTIC_UUID = '71DA3FD1-7E10-41C1-B16F-4430B506CDE7'
const ACTION_TIMEOUT = 3000
const kSeparater = '##rkb-1l0v3y0u3000##'
const PING = Buffer.from('ping')
const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time))
const noble = require('@abandonware/noble')
const [, , target] = process.argv
const debug = require('debug')('blkeyboard')
const {
  MAX_RECONNECT_TIMES = 5
} = process.env

const devices = {}

let scanTimer

// 蓝牙 设备 状态发生变化
noble.on('stateChange', (state) => {
  debug('stateChange', state)

  switch (state) {
    case 'poweredOff': // 蓝牙 关闭 后, 自动退出.
      noble.stopScanning()
      console.log('🤔 Bluetooth closed, Goodbye.')
      process.exit(1)
    case 'poweredOn': // 打开
      console.log('🤔 Start Scanning ...')

      clearTimeout(scanTimer)
      scanTimer = setTimeout(() => {
        console.log('🤔 Scan Timeout, Goodbye.')
        process.exit(1)
      }, 5000)

      noble
        .startScanningAsync([SERVICE_UUID]) // 扫描成功后, 会触发 discover 事件
        .catch((e) => { // Scan 出现问题时, 打印错误信息后, 退出
          clearTimeout(scanTimer)
          console.error('🤔 Scan failure', e)
          process.exit(1)
        })
      break
  }
})

const sendMessage = async (type, message = Buffer.alloc(0)) => {
  const prefix = Buffer.from(`${type}${kSeparater}`, 'ascii')

  process.stdin.emit('input', Buffer.concat([prefix, message]))
}

process.stdin.setRawMode(true)
process.stdin.resume()

const keys = {
  '\u007F': 'input-delete', // 0x7f === 127 === backspace
  '\u001B[A': 'move-up',
  '\u001B[B': 'move-down',
  '\u001B[C': 'move-right',
  '\u001B[D': 'move-left'
}

process.stdin.on('data', (buf) => {
  const cmd = keys[buf.toString()]

  if (cmd) {
    sendMessage(cmd)
    return
  }

  if (buf.length === 1) {
    if (buf[0] === 0x0D) { // fix \r to \n
      buf[0] = 0x0A
    }
  }

  sendMessage('input', buf)
})

const emojis = ['🍇', '🍈', '🍉', '🍊', '🍋', '🍌', '🍍', '🥭', '🍎', '🍏', '🍐', '🍑', '🍒', '🍓', '🫐', '🥝', '🍅', '🫒', '🥥', '🥑', '🍆', '🥔', '🥕', '🌽', '🌶️', '🫑', '🥒', '🥬', '🥦', '🧄', '🧅', '🍄', '🥜', '🌰', '🍞', '🥐', '🥖', '🫓', '🥨', '🥯', '🥞', '🧇', '🧀', '🍖', '🍗', '🥩', '🥓', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🫔', '🥙', '🧆', '🥚', '🍳', '🥘', '🍲', '🫕', '🥣', '🥗', '🍿', '🧈', '🧂', '🥫', '🍱', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣', '🍤', '🍥', '🥮', '🍡', '🥟', '🥠', '🥡', '🦪', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍮', '🍯', '🍼', '🥛', '☕', '🫖', '🍵', '🍶', '🍾', '🍷', '🍸', '🍹', '🍺', '🍻', '🥂', '🥃', '🥤', '🧋', '🧃', '🧉', '🧊', '🥢', '🍽️', '🍴', '🥄']

noble.on('discover', (peripheral) => {
  clearTimeout(scanTimer)

  const { localName } = peripheral.advertisement

  if (
    !peripheral.connectable || // 不可连接的, 忽略
    (target && localName !== target) // 当指定 目标时 如果名字不匹配, 则忽略
  ) {
    return debug('can not connectable!!!!!!!!!!!!!!')
  }

  // BLE cannot scan and connect in parallel, so we stop scanning here:
  noble.stopScanning()

  const localId = emojis.shift()

  emojis.push(localId)

  if (typeof devices[localName] === 'undefined') {
    devices[localName] = {
      discoverId: localId,
      retry: 0,
      alive: false
    }

    console.log(localId, `🤔 Found device, name: [${localName}], Connecting ...`)
  } else {
    devices[localName].discoverId = localId
  }

  debug(localId, 'discover device:', localName, devices[localName].retry, peripheral.state)

  let ping = null

  const useCallback = (callback) => (...args) => {
    if (localId !== devices[localName].discoverId) {
      debug('invalid discoverId', localId, devices[localName].discoverId)
      return
    }

    return callback.apply(null, args)
  }

  const retry = useCallback(() => {
    devices[localName].retry++

    peripheral.removeAllListeners(['connect', 'disconnect', 'servicesDiscover', 'characteristicsDiscover'])

    clearTimeout(ping)
    clearTimeout(scanTimer)

    if (devices[localName].retry > MAX_RECONNECT_TIMES) {
      console.log(localId, `🤔 [${localName}] Connection ${devices[localName].alive ? 'failed' : 'unstable'}, Goodbye.`)

      process.exit(1)
    }

    debug(localId, 'retry', devices[localName].retry, MAX_RECONNECT_TIMES, peripheral.state)

    if (peripheral.state !== 'disconnected') {
      debug(localId, 'try disconnect', devices[localName].retry, MAX_RECONNECT_TIMES, peripheral.state)

      peripheral.disconnect()

      debug(localId, 'disconnect triggered', devices[localName].retry, MAX_RECONNECT_TIMES, peripheral.state)
    }

    let timeout = false

    scanTimer = setTimeout(() => {
      console.log(`${localId} 🤔 Reconnect Timeout. ${devices[localName].retry}`)
      timeout = true

      noble.stopScanning(retry)
    }, 5000)

    debug(localId, 'ReScanning')

    // 调用 Scanning 之后, 如果找到设备 会触发 discover 事件, 然后会清除上面设置的计时器
    // 如果在 5 秒后还没有触发, 则认为 没有找到设备, 则执行重试逻辑.
    noble
      .startScanningAsync([SERVICE_UUID])
      .catch(useCallback((e) => { // 在已经连接的状态下, 用户远离 导致蓝牙 通信超时后, 走到 这里, 会触发  Could not start scanning, state is resetting (not poweredOn) 的报错, 所以需要在这时 捕获一下 异常, 并延时 进行重试.
        if (timeout) { // 如果已经超时了, 则不用再清计时器和执行 retry 了, 因为在超时处理流程里面已经自动执行重试了.
          return
        }

        console.log(`${localId} 🤔 Scanning faile.`, e)

        clearTimeout(scanTimer)
        setTimeout(retry, 3000)
      }))
  })

  peripheral.setMaxListeners(0)

  // 清理之前 可能潜在留下的事件
  peripheral.removeAllListeners(['connect', 'disconnect', 'servicesDiscover', 'characteristicsDiscover'])

  peripheral.once('disconnect', () => {
    debug(localId, `Disconnect event, current state: [${peripheral.state}]`)
    retry()
  })

  const initKeyboard = useCallback(([keyboard]) => {
    if (!keyboard) {
      return Promise.reject(new Error('discoverCharacteristicsAsync empty!!!'))
    }

    debug(localId, 'discoverCharacteristicsAsync success')

    keyboard.setMaxListeners(0)

    const send = (buf) => new Promise((resolve) => {
      if (localId !== devices[localName].discoverId) {
        return resolve(false)
      }

      clearTimeout(ping)

      debug(`${localId} Send [${buf.toString('utf8')}], current state: [${peripheral.state}]`)

      if (peripheral.state !== 'connected') { // 如果状态 不是 已连接, 则直接返回 false
        process.stdin.removeListener('input', send)

        return resolve(false)
      }

      Promise.race([
        keyboard.writeAsync(buf, false).then(() => keyboard.readAsync()),
        sleep(456).then(() => Promise.reject(new Error(`send ${buf.toString('utf8')} timeout`)))
      ]).then(() => {
        resolve(true)
      }, useCallback((e) => {
        debug(`${localId} send [${buf.toString('utf8')}] timeout, current state: ${peripheral.state}`, e)

        process.stdin.removeListener('input', send) // 发送出错的话, 解绑 input 事件

        if (devices[localName].retry === 0 && devices[localName].alive) {
          console.log(localId, `🤔 [${localName}] Connection lost, Reconnecting ...`)
        }

        if (peripheral.state === 'connected') {
          debug(localId, 'Send timeout, trigger disconnect ...')

          peripheral.disconnect(() => resolve(false))
        } else {
          resolve(false)
        }
      }))
    }).then((success) => {
      debug(localId, `[${devices[localName].retry}] [${new Date()}] send [${buf.toString('utf8')}], success: ${success}`)

      if (success) {
        clearTimeout(ping)

        ping = setTimeout(() => {
          send(PING)
        }, 1000)
      }

      return success
    })

    if (devices[localName].retry === 0) {
      console.log(localId, `🤔 [${localName}] Connection successful, connection stability checking ...`)
    }

    send(PING).then(useCallback((success) => {
      if (!success) {
        return
      }

      devices[localName].alive = true
      devices[localName].retry = 0

      process.stdin.on('input', send)

      console.log(localId, `🌈 [${localName}] Ready for typing :)`)
    }))
  })

  const discoverCharacteristics = useCallback(([characteristic]) => {
    if (!characteristic) {
      return Promise.reject(new Error('discoverServicesAsync empty!!!'))
    }

    debug(`${localId} discoverServicesAsync success!`)

    characteristic.setMaxListeners(0)

    return Promise.race([
      characteristic.discoverCharacteristicsAsync([CHARACTERISTIC_UUID]),
      sleep(ACTION_TIMEOUT).then(() => Promise.reject(new Error(`discoverCharacteristicsAsync timeout, ${peripheral.state}`)))
    ])
  })

  const discoverServices = useCallback(() => {
    debug(localId, 'connectAsync success, start discoverServicesAsync')

    return Promise.race([
      peripheral.discoverServicesAsync([SERVICE_UUID]),
      sleep(ACTION_TIMEOUT).then(() => Promise.reject(new Error(`discoverServicesAsync timeout, ${peripheral.state}`)))
    ])
  })

  Promise.race([
    peripheral.state === 'connected' || peripheral.connectAsync(),
    sleep(ACTION_TIMEOUT).then(() => Promise.reject(new Error('Connect Timeout.')))
  ])
    .then(discoverServices)
    .then(discoverCharacteristics)
    .then(initKeyboard)
    .catch(useCallback((e) => {
      debug(`${localId} current peripheral.state: [${peripheral.state}]`, e)

      switch (peripheral.state) {
        case 'connecting': { // 连接中
          // TODO:  状态为 连接中 的时候, 触发 disconnect 好像不会 触发上面绑定的事件, 会导致 程序直接卡在这里, 不会继续走下去了.
          const dis = setTimeout(() => {
            console.log(`${localId} 🤔 Disconnect Timeout, retry ...`)
            retry()
          }, 1000)

          peripheral.disconnectAsync().then(() => {
            debug(`${localId} disconnect success`)
            clearTimeout(dis)
          }, (e) => {
            debug(`${localId} disconnect fail:`, e)
          })
          break
        }
        case 'connected': // 已连接
          peripheral.disconnect()
          break
        case 'error': // 连接出错
          retry()
          break
        case 'disconnected': // 状态为 已断开的情况下, 则什么也不做, 因为会触发到 disconnect 的事件, 里面有重试流程
          // DO NOTHING
          break
        default:
        // TODO: retry ???
        debug(`====== unknow state, retry: ${peripheral.state}`)
          retry()
      }
    }))
})

const cleanup = () => {
  debug('Caught interrupt signal')
  noble.stopScanning(() => process.exit())
}

process.on('SIGINT', cleanup)
process.on('SIGQUIT', cleanup)
process.on('SIGTERM', cleanup)
