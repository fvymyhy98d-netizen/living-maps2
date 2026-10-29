/* =========================================================
   课堂协同服务器回归测试（node test_collab.js）
   会真的把 server.js 跑起来（随机端口），验证：静态托管 / 协同标记注入 / SSE 实时广播 / 状态存取
   改了 server.js 或 collab.js 的传输协议后必须重跑且全部 PASS
   ========================================================= */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const PORT = 4787 + (process.pid % 300);
let pass = 0, fail = 0, done = false;
function T(name, ok, extra) {
  if (ok) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  <- ' + String(extra).slice(0, 160) : '')); }
}
function req(method, p, body, cb) {
  const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method: method }, function (res) {
    let d = ''; res.on('data', function (c) { d += c; }); res.on('end', function () { cb(res.statusCode, d); });
  });
  r.on('error', function (e) { cb(0, 'E ' + e.message); });
  if (body) r.write(body);
  r.end();
}
const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: Object.assign({}, process.env, { PORT: String(PORT) }) });
let out = '';
srv.stdout.on('data', function (c) { out += c; if (!done && out.indexOf('COLLAB READY') >= 0) { done = true; run(); } });
srv.stderr.on('data', function (c) { out += c; });
srv.on('exit', function () { if (!done) { done = true; console.log('  FAIL 服务器未能启动\n' + out); process.exit(1); } });
setTimeout(function () { if (!done) { done = true; console.log('  FAIL 启动超时\n' + out); srv.kill(); process.exit(1); } }, 6000);

function run() {
  let sseBuf = '';
  let sseRes = null;
  const finish = function () {
    srv.kill();
    console.log(fail ? ('COLLAB FAIL ' + fail + '/' + (pass + fail)) : ('COLLAB PASS ' + pass + '/' + pass));
    process.exit(fail ? 1 : 0);
  };
  /* SSE 长连接先挂着收广播 */
  const sse = http.request({ host: '127.0.0.1', port: PORT, path: '/collab/stream' }, function (res) {
    sseRes = res.statusCode;
    res.on('data', function (c) { sseBuf += c; });
  });
  sse.on('error', function () { /* finish 里判 */ });
  sse.end();

  setTimeout(function () {
    T('SSE 流已建立', sseRes === 200, 'status=' + sseRes);
    req('GET', '/collab/ping', null, function (s, d) { T('/collab/ping', s === 200 && d === 'ok', d); step2(); });
    function step2() {
      req('GET', '/', null, function (s, d) {
        T('首页 200', s === 200, 'status=' + s);
        T('注入协同标记', d.indexOf('window.LM_COLLAB_SERVER=1') >= 0, '');
        step3();
      });
    }
    function step3() {
      req('GET', '/js/app.js', null, function (s, d) {
        T('静态 js 托管', s === 200 && d.indexOf('window.LMApp') >= 0, '');
        step4();
      });
    }
    function step4() {
      const msg = JSON.stringify({ t: 'lm1', type: 'commit', from: 'TESTDEV', name: '测试设备', ts: Date.now(), content: { pages: [{ id: 'home' }] } });
      req('POST', '/collab/emit', msg, function (s, d) {
        T('emit 返回 ok', s === 200 && d === 'ok', d);
        setTimeout(function () {
          T('SSE 收到广播', sseBuf.indexOf('"type":"commit"') >= 0 && sseBuf.indexOf('TESTDEV') >= 0, sseBuf.slice(0, 80));
          step5();
        }, 300);
      });
    }
    function step5() {
      req('GET', '/collab/state', null, function (s, d) {
        let ok = false;
        try { const j = JSON.parse(d); ok = s === 200 && j.content && Array.isArray(j.content.pages) && j.ts > 0; } catch (e) { ok = false; }
        T('服务器保存最新内容', ok, d.slice(0, 80));
        step6();
      });
    }
    function step6() {
      req('GET', '/../secret.txt', null, function (s) { T('路径穿越被拦截', s === 403 || s === 404 || s === 400, 'status=' + s); finish(); });
    }
  }, 400);
}
