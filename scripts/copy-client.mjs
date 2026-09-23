import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'

const helper = readFileSync('src/plugin-update-ui.js', 'utf8')
  .replace(/\nexport\s*\{[\s\S]*\}\s*;?\s*$/, '\n')
  .replace(/\bconst CSS =/, 'const PLUGIN_UPDATE_CSS =')
  .replace(/\bfunction ensureStyle\(/, 'function ensurePluginUpdateStyle(')
  .replace(/\btextContent = CSS;/, 'textContent = PLUGIN_UPDATE_CSS;')
  .replace(/\bensureStyle\(\)/g, 'ensurePluginUpdateStyle()')

const antd = await build({
  stdin: {
    contents: [
      'import ConfigProvider from "antd/es/config-provider";',
      'import theme from "antd/es/theme";',
      'import Modal from "antd/es/modal";',
      'import Select from "antd/es/select";',
      'import Switch from "antd/es/switch";',
      'import Button from "antd/es/button";',
      'import Input from "antd/es/input";',
      'import Progress from "antd/es/progress";',
      'import Checkbox from "antd/es/checkbox";',
      'import Segmented from "antd/es/segmented";',
      'import Tag from "antd/es/tag";',
      'import Alert from "antd/es/alert";',
      'import localeZh from "antd/locale/zh_CN";',
      'import localeEn from "antd/locale/en_US";',
      'module.exports = {',
      '  antd: { ConfigProvider, theme, Modal, Select, Switch, Button, Input, Progress, Checkbox, Segmented, Tag, Alert },',
      '  localeZh,',
      '  localeEn,',
      '};',
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'antd-entry.js',
    loader: 'js',
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'eof',
  sourcesContent: false,
  external: [
    'react',
    'react-dom',
    'react-dom/client',
    'react/jsx-runtime',
  ],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
})

const client = readFileSync('client.js', 'utf8')
  .replace('    const antd = require("antd");', '    const antd = __imAntdBundle.antd;')
  .replace('    const zhCN = require("antd/locale/zh_CN");', '    const zhCN = __imAntdBundle.localeZh;')
  .replace('    const enUS = require("antd/locale/en_US");', '    const enUS = __imAntdBundle.localeEn;')
if (client.includes('require("antd")') || client.includes('require("antd/')) {
  throw new Error('client.js still requires antd; ModuleLoader cannot resolve it')
}
const start = client.indexOf('    var module = { exports: {} };')
const end = client.lastIndexOf('    return module.exports;')
if (start < 0 || end < 0) throw new Error('client.js ModuleLoader factory not found')
const body = client.slice(start, end + '    return module.exports;'.length)

writeFileSync('lib/client.js', [
  'window.__ModuleLoader__.load({ id: "@michengai/dsh-im-connect", factory: (require) => {',
  helper,
  '    const __imAntdModule = { exports: {} };',
  '    (function (module, exports, require) {',
  antd.outputFiles[0].text.replace(/[ \t]+$/gm, ''),
  '    })(__imAntdModule, __imAntdModule.exports, require);',
  '    const __imAntdBundle = __imAntdModule.exports;',
  body,
  '} });',
  '',
].join('\n'))

const check = spawnSync(process.execPath, ['--check', 'lib/client.js'], { encoding: 'utf8' })
if (check.status !== 0) {
  throw new Error(check.stderr || check.stdout || 'lib/client.js failed syntax check')
}
