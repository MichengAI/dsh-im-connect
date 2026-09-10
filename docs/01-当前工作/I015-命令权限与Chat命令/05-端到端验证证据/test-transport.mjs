const originalFetch = globalThis.fetch
const targetOrigin = process.env.IM_E2E_MOCK_ORIGIN
if (!targetOrigin?.startsWith('http://127.0.0.1:')) throw new Error('test mock must be loopback')
globalThis.fetch = function(input, init) {
  const url = new URL(input instanceof Request ? input.url : input)
  if (url.hostname === 'api.telegram.org') {
    const target = targetOrigin + url.pathname + url.search
    input = input instanceof Request ? new Request(target, input) : target
  }
  return originalFetch(input, init)
}