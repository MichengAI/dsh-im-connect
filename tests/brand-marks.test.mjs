import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const discord = readFileSync(new URL('../assets/brands/discord-symbol.svg', import.meta.url))
const slackPng = readFileSync(new URL('../assets/brands/slack-hash.png', import.meta.url))
const slackSvg = readFileSync(new URL('../assets/brands/slack-hash.svg', import.meta.url), 'utf8')

test('Slack 和 Discord 使用官方标文件，不手绘、不改色', () => {
  assert.equal(createHash('sha256').update(discord).digest('hex'), '296286aa112c4400af8e96191ab888f81abd4bd1d5dc7294112a622ef43581b1')
  assert.equal(createHash('sha256').update(slackPng).digest('hex'), 'cfd9f050bf26ea547af438722c5a93be002c721f0f32a3c996595eab7af1b36d')
  assert.equal(createHash('sha256').update(slackSvg).digest('hex'), '17160477a475166ad0556e0028e3b0bd0634d70c02e7b920c04a4429ea184ab3')
  assert.match(discord.toString('utf8'), /fill="#5865F2"/)
  assert.match(slackSvg, /fill="#E01E5A"/)
  assert.match(slackSvg, /fill="#36C5F0"/)
  assert.match(slackSvg, /fill="#2EB67D"/)
  assert.match(slackSvg, /fill="#ECB22E"/)
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const brand = client.slice(client.indexOf('function BrandMark'), client.indexOf('function Logo'))
  const officialPath = discord.toString('utf8').match(/d="([^"]+)"/)[1]
  assert.equal(brand.includes(officialPath), true)
  for (const path of slackSvg.match(/d="([^"]+)"/g)) {
    assert.equal(brand.includes(path.slice(3, -1)), true)
  }
  const discordMark = brand.slice(brand.indexOf('id === "discord"'), brand.indexOf('id === "slack"'))
  const slackAt = brand.indexOf('id === "slack"')
  const slackMark = brand.slice(slackAt, brand.indexOf('return svg("0 0 24 24"', slackAt))
  assert.match(discordMark, /compact \? /)
  assert.match(slackMark, /h\("path"/)
  assert.doesNotMatch(brand, /h\("image"/)
  assert.doesNotMatch(brand, /h\("img"/)
  assert.doesNotMatch(brand, /#4A154B/)
  assert.doesNotMatch(brand, /M20\.317 4\.37/)
  assert.match(client, /\.ima-n-folder>\.ima-logo svg\{width:16px;height:16px/)
})
