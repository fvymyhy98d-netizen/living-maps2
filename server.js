#!/usr/bin/env node
/* =========================================================
   活地图 · 课堂协同服务器（方案 B：把这台电脑当服务器）
   用法：node server.js   （手机/同学电脑连同一个 WiFi，浏览器开下面打印的地址）
   功能：静态托管本目录网站 + SSE 实时协同（谁保存了内容，其他设备秒级收到并刷新）
   说明：与 GitHub Pages 互不干扰——这只在课堂演示时用；关掉 Ctrl+C 即可
   ========================================================= */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ROOT = __dirname;
const PORT = +(process.env.PORT || 8787);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};
let latest = null;    /* 服务器手里最新的一份内容（新设备进门时拉） */
let latestTs = 0;
const clients = new Set();

function broadcast(raw) { clients.forEach(function (res) { try { res.write('data: ' + raw + '\n\n'); } catch (e) { /* noop */ } }); }

const server = http.createServer(function (req, res) {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  /* ---- 协同接口 ---- */
  if (p === '/collab/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache',
      'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'
    });
    res.write('retry: 2000\n\n');
    clients.add(res);
    req.on('close', function () { clients.delete(res); });
    return;
  }
  if (p === '/collab/emit' && req.method === 'POST') {
    let body = '', over = false;
    req.on('data', function (c) { body += c; if (body.length > 3e6) { over = true; req.destroy(); } });
    req.on('end', function () {
      if (over) return;
      try {
        const m = JSON.parse(body);
        if (m && m.t === 'lm1') {
          if (m.type === 'commit' && m.content && Array.isArray(m.content.pages)) { latest = m.content; latestTs = +m.ts || Date.now(); }
          broadcast(body); /* 原样转发给所有客户端（含发送者，客户端按 from 过滤） */
        }
      } catch (e) { /* 忽略坏包 */ }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('ok');
    });
    return;
  }
  if (p === '/collab/state') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ts: latestTs, content: latest }));
    return;
  }
  if (p === '/collab/ping') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }
  /* ---- 静态文件 ---- */
  let fp;
  try { fp = path.normalize(path.join(ROOT, decodeURIComponent(p))); } catch (e) { res.writeHead(400); res.end(); return; }
  if (fp !== ROOT && !fp.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  if (p === '/' || p === '/index.html') fp = path.join(ROOT, 'index.html');
  fs.readFile(fp, function (err, buf) {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 Not Found'); return; }
    let out = buf;
    /* 注入协同标记：页面据此自动切换到「服务器中转」模式 */
    if (fp.endsWith('index.html')) {
      const s = buf.toString('utf8');
      if (s.indexOf('LM_COLLAB_SERVER') < 0) out = Buffer.from(s.replace(/<head>/i, '<head><script>window.LM_COLLAB_SERVER=1</script>'), 'utf8');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(out);
  });
});
server.listen(PORT, function () {
  const ips = [];
  Object.keys(os.networkInterfaces()).forEach(function (k) {
    (os.networkInterfaces()[k] || []).forEach(function (n) {
      if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
    });
  });
  console.log('COLLAB READY');
  console.log('  本机打开：   http://localhost:' + PORT + '/');
  ips.forEach(function (ip) { console.log('  同一WiFi设备：http://' + ip + ':' + PORT + '/'); });
  console.log('  （Ctrl+C 停止；仅课堂演示用，正式版仍走 GitHub Pages）');
});
