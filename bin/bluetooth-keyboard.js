#!/usr/bin/env node

const SERVICE_UUID = '81DA3FD1-7E10-41C1-B16F-4430B506CDE8'
const CHARACTERISTIC_UUID = '71DA3FD1-7E10-41C1-B16F-4430B506CDE7'
const kSeparater = '##rkb-1l0v3y0u3000##'
const PING = Buffer.from('ping')
const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time))
const noble = require('@abandonware/noble')
const [, , target] = process.argv
const devices = {}

let scanTimer

// 蓝牙 设备 状态发生变化
noble.on('stateChange', (state) => {
  // console.log('stateChange', state)

  switch (state) {
    case 'poweredOff': // 关闭
      console.log('🤔 Bluetooth closed, Goodbye.')
      process.exit(1)
    case 'poweredOn': // 打开
      scanTimer = setTimeout(() => {
        console.log('🤔 Scan Tmeout, Goodbye.')
        process.exit(1)
      }, 5000)
      console.log('🤔 Start Scanning...')
      noble.startScanning([SERVICE_UUID])
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
  // console.log('Data:', JSON.stringify(buf), buf.toString('hex').toUpperCase().replace(/(..)/g, '$1 '))

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

noble.on('discover', async (peripheral) => {
  const { localName } = peripheral.advertisement

  if (
    !peripheral.connectable || // 不可连接的, 忽略
    (target && localName !== target) // 当指定 目标时 如果名字不匹配, 则忽略
  ) {
    return
  }

  if (typeof devices[localName] === 'undefined') {
    devices[localName] = {
      retry: 0,
      alive: false
    }

    console.log(`🤔 Found device, name: [${localName}], Connecting...`)
  }

  clearTimeout(scanTimer)

  let ping = null
  let send = null

  peripheral.removeAllListeners(['connect', 'servicesDiscover', 'servicesDiscover'])

  peripheral.once('disconnect', async () => {
    devices[localName].retry++

    peripheral.removeAllListeners(['connect', 'servicesDiscover'])

    if (send) {
      process.stdin.removeListener('input', send)
    }

    clearTimeout(ping)

    if (devices[localName].retry > 5) {
      console.log(`🤔 [${localName}] Connection ${devices[localName].alive ? 'failed' : 'unstable'}, Goodbye.`)

      process.exit(1)
    }

    await sleep(233)

    noble.startScanning([SERVICE_UUID])
  })

  peripheral.once('connect', () => {
    peripheral.discoverServices([SERVICE_UUID])
  })

  peripheral.once('servicesDiscover', ([Remoboard]) => {
    // console.log('[Service]', Remoboard)
    Remoboard.removeAllListeners(['characteristicsDiscover'])

    Remoboard.once('characteristicsDiscover', ([keyboard]) => {
      // console.log('[Keyboard]', keyboard)

      keyboard.setMaxListeners(0)

      send = (buf) => {
        // const ss = Date.now()

        return new Promise((resolve) => {
          clearTimeout(ping)

          let timeout = false
          const t = setTimeout(() => {
            timeout = true

            resolve(false)

            if (devices[localName].retry === 0 && devices[localName].alive) {
              console.log(`🤔 [${localName}] Connection lost, Reconnecting...`)
            }

            if (peripheral.state === 'connected') {
              peripheral.disconnect()
            }
          }, 456)

          keyboard.write(buf, false, async (e) => {
            if (timeout) {
              return
            }

            if (e) {
              console.error(`🤔 [${localName}] Write data: [${buf.toString('utf8')}] failed, with error:`, e)
              resolve(false)
              return
            }

            clearTimeout(t)

            keyboard.read((e) => {
              resolve(!e)
            })
          })
        }).then((success) => {
          // console.log(`[${retry}] [${new Date()}] send [${buf.toString('utf8')}], success: ${success}, with ${Date.now() - ss}ms`)

          if (success) {
            clearTimeout(ping)

            ping = setInterval(() => {
              send(PING)
            }, 1000)
          }

          return success
        })
      }

      process.stdin.on('input', send)

      // noble.stopScanning()

      if (devices[localName].retry === 0) {
        console.log(`🤔 [${localName}] Connection successful, connection stability checking...`)
      }


      sleep(1000).then(() => send(PING))
      .then((success) => success && sleep(500).then(() => send(PING)))
      .then((success) => success && sleep(500).then(() => send(PING)))
      .then((success) => success && sleep(500).then(() => send(PING)))
      .then((success) => success && sleep(500).then(() => send(PING)))
      .then((success) => {
        if (!success) {
          return
        }

        devices[localName].alive = true
        devices[localName].retry = 0

        console.log(`🌈 [${localName}] Ready for typing :)`)
      })
    })

    Remoboard.discoverCharacteristics([CHARACTERISTIC_UUID])
  })

  peripheral.connect()
})
