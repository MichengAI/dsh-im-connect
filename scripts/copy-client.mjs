import { readFileSync, writeFileSync } from 'node:fs'

const helper = readFileSync('src/plugin-update-ui.js', 'utf8').replace(/^export\s+/gm, '')
const client = readFileSync('client.js', 'utf8')
writeFileSync('lib/client.js', `${helper}\n${client}`, 'utf8')
