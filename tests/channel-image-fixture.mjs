import { mock } from 'node:test'
import https from 'node:https'
import dns from 'node:dns'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'

// Fake only the network boundary; exercise the real URL/DNS/body/decrypt code.
export function network(body, { status = 200, headers = {}, address = '8.8.8.8', stall = false } = {}) {
  const calls = []
  mock.method(dns, 'lookup', (host, opts, cb) => cb(null, [{ address, family: 4 }]))
  mock.method(https, 'request', (url, options, cb) => {
    const req = new EventEmitter()
    req.destroy = error => queueMicrotask(() => req.emit('error', error))
    req.end = data => {
      calls.push({ url: String(url), options, body: data })
      options.lookup(url.hostname, {}, (error) => {
        if (error) return req.destroy(error)
        if (stall) return
        const res = Readable.from([typeof body === 'function' ? body(calls.at(-1)) : body])
        res.statusCode = status; res.headers = headers
        queueMicrotask(() => cb(res))
      })
    }
    return req
  })
  return calls
}
