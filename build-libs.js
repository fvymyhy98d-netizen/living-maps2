/* =========================================================
   build-libs.js —— 把 Yjs 三件套（npm 包为 CJS 格式）打包成浏览器 IIFE，输出到 lib/
   为什么需要：yjs@13 / y-webrtc@10 / y-indexeddb@10 的 npm 包只发 CJS/ESM，
   不再自带浏览器 UMD；本项目 CSP 限定 script-src 'self'，禁止 CDN，
   所以统一本地化到 lib/（相对路径引用，见 index.html）。
   用法（升级 Yjs 版本时重跑）：
     npm.cmd install --no-save --no-package-lock esbuild yjs y-webrtc y-indexeddb
     node build-libs.js
   产物全局名（js/ycollab.js 的解析器按此识别）：
     lib/yjs.js          → window.Yjs
     lib/y-webrtc.js     → window.YjsWebRTC
     lib/y-indexeddb.js  → window.YjsIndexeddb
   ========================================================= */
'use strict';
const esbuild = require('esbuild');
const fs = require('fs');
if (!fs.existsSync('lib')) fs.mkdirSync('lib');
/* y-webrtc 在 node 环境才 require('ws')；浏览器打包时把它指到原生 WebSocket（不会被真正调用）
   @cloudbase/js-sdk 的 optionalDependencies（ws/node-fetch/jsonwebtoken）同理——全 stub 掉 */
if (!fs.existsSync('ws-stub.tmp.js')) {
  fs.writeFileSync('ws-stub.tmp.js', "module.exports = typeof WebSocket !== 'undefined' ? WebSocket : function () { throw new Error('ws is node-only'); };");
}
if (!fs.existsSync('node-stub.tmp.js')) {
  fs.writeFileSync('node-stub.tmp.js', "module.exports = {}; throw new Error('node-only stub');");
}
/* y-protocols 打包入口：sync（文档同步协议）+ awareness（在线状态协议），内部依赖 lib0 */
if (!fs.existsSync('yp-entry.tmp.js')) {
  fs.writeFileSync('yp-entry.tmp.js',
    "import * as sync from 'y-protocols/sync';\n" +
    "import * as awareness from 'y-protocols/awareness';\n" +
    "export { sync, awareness };\n");
}
const STUBS = {
  ws: './ws-stub.tmp.js',
  'node-fetch': './node-stub.tmp.js',
  jsonwebtoken: './node-stub.tmp.js',
  '@cloudbase/signature-nodejs': './node-stub.tmp.js',
  fs: './node-stub.tmp.js',
  path: './node-stub.tmp.js'
};
const jobs = [
  ['node_modules/yjs/dist/yjs.cjs', 'lib/yjs.js', 'Yjs'],
  ['node_modules/y-indexeddb/dist/y-indexeddb.cjs', 'lib/y-indexeddb.js', 'YjsIndexeddb'],
  ['yp-entry.tmp.js', 'lib/y-protocols.js', 'YProtocols']
];
let fail = 0;
for (const job of jobs) {
  const entry = job[0], outfile = job[1], globalName = job[2];
  if (!fs.existsSync(entry)) { console.log('SKIP ' + entry + '（未安装，跳过）'); continue; }
  try {
    esbuild.buildSync({
      entryPoints: [entry],
      bundle: true,
      minify: true,
      format: 'iife',
      globalName: globalName,
      platform: 'browser',
      outfile: outfile,
      alias: STUBS,
      logLevel: 'silent'
    });
    const kb = Math.round(fs.statSync(outfile).size / 1024);
    console.log('OK   ' + outfile + '（' + kb + 'KB，全局名 ' + globalName + '）');
  } catch (e) {
    fail++;
    console.log('FAIL ' + entry + ' —— ' + (e && e.message ? e.message : e));
  }
}
/* mqtt.min.js 是预压缩 UMD（内部自挂全局 window.mqtt）——不能用 esbuild 再打包：
   esbuild 追踪不到 UMD 工厂写入的 exports，产出的 IIFE 返回 undefined（全局名丢失，
   曾致浏览器「MQTT 库未加载」）。原样复制即可，浏览器原生执行 UMD 挂全局。 */
try {
  fs.copyFileSync('node_modules/mqtt/dist/mqtt.min.js', 'lib/mqtt.js');
  const kb = Math.round(fs.statSync('lib/mqtt.js').size / 1024);
  console.log('OK   lib/mqtt.js（' + kb + 'KB，UMD 原样复制，全局名 mqtt）');
} catch (eM) {
  fail++;
  console.log('FAIL mqtt —— ' + (eM && eM.message ? eM.message : eM));
}
try { fs.unlinkSync('ws-stub.tmp.js'); } catch (e) { /* noop */ }
try { fs.unlinkSync('node-stub.tmp.js'); } catch (e) { /* noop */ }
try { fs.unlinkSync('yp-entry.tmp.js'); } catch (e) { /* noop */ }
console.log(fail ? 'BUILD FAILED' : 'BUILD OK');
process.exit(fail ? 1 : 0);
