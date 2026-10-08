import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const discord = readFileSync(new URL('../assets/brands/discord-symbol.svg', import.meta.url))
const slack = readFileSync(new URL('../assets/brands/slack-hash.png', import.meta.url))

test('Slack 和 Discord 使用官方标文件，不手绘、不改色', () => {
  assert.equal(createHash('sha256').update(discord).digest('hex'), '296286aa112c4400af8e96191ab888f81abd4bd1d5dc7294112a622ef43581b1')
  assert.equal(createHash('sha256').update(slack).digest('hex'), 'cfd9f050bf26ea547af438722c5a93be002c721f0f32a3c996595eab7af1b36d')
  assert.match(discord.toString('utf8'), /fill="#5865F2"/)
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const brand = client.slice(client.indexOf('function BrandMark'), client.indexOf('function Logo'))
  assert.equal(brand.includes(discord.toString('base64')), true)
  assert.equal(brand.includes(slack.toString('base64')), true)
  assert.doesNotMatch(brand, /#4A154B/)
  assert.doesNotMatch(brand, /M20\.317 4\.37/)
  assert.match(brand, /h\("img"/)
})
