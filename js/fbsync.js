/* =========================================================
   反馈跨设备同步（修复92）
   —— 只走「数据分支」（lm-data），**不触发 Pages 构建**，也不占访客任何额度。
   背景：提交要求里有一条「已获得并回应非本组同学的反馈」，
        而纯静态站的反馈原本只存在提交者那台浏览器里 → 同学手机留言，组长看不到。
   做法（不新增服务器、不引第三方、不要任何 Key）：
     ① 有 Token 的设备（组长/团队）：反馈自动同步到仓库数据分支的 data/feedback.json，
        多台设备打开反馈页时拉取合并；改状态 / 写回复 / 删除都会同步过去。
     ② 没有 Token 的访客：留言后点「📤 发给组长」→ 生成一条自带内容的链接
        （#fb=<压缩串>），发到群里；组长一打开就自动收进云端（并去重）。
     ③ 合并规则：按 id 去重、updatedAt 大者胜；删除写「墓碑」而不是直接抹掉，
        避免 A 删了、B 又把它同步回来。
   隐私说明：仓库是公开的，data/feedback.json 理论上能被直接下载到（前端不做展示，
   但文件本身可读）。要真正私密，下一步可加「口令加密」再上传。
   ========================================================= */
(function (W) {  /* ★ 修复92：Node（单测）里没有 window → globalThis 兜底；浏览器里就是 window */
W.LMFB = (function () {
  'use strict';
  const FILE_PATH = 'data/feedback.json';

  /* ---------- ① 纯函数：规范化 / 合并 / 打包 ---------- */
  function norm(it) {
    if (!it || typeof it !== 'object' || !it.id) return null;
    const o = {
      id: String(it.id), ts: +it.ts || 0, type: String(it.type || ''),
      name: String(it.name || '匿名').slice(0, 30), text: String(it.text || ''),
      dev: String(it.dev || ''), url: String(it.url || ''),
      status: String(it.status || '待处理'), reply: String(it.reply || '')
    };
    o.updatedAt = +it.updatedAt || o.ts || 0;
    if (it.del) o.del = 1;
    return o;
  }
  /* 合并两份反馈列表：同 id 取 updatedAt 更新的；其余按时间升序 */
  function merge(a, b) {
    const map = {};
    (a || []).forEach(function (x) { const n = norm(x); if (n) map[n.id] = n; });
    (b || []).forEach(function (x) {
      const n = norm(x); if (!n) return;
      const old = map[n.id];
      if (!old || n.updatedAt >= old.updatedAt) map[n.id] = n;
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (x, y) { return (x.ts - y.ts) || (x.id < y.id ? -1 : 1); });
  }
  /* UTF-8 ↔ base64url（链接里安全，不含 + / =） */
  function b64e(s) {
    const bytes = unescape(encodeURIComponent(String(s)));
    const out = (typeof btoa === 'function') ? btoa(bytes) : Buffer.from(bytes, 'binary').toString('base64');
    return out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64d(s) {
    const t = String(s).replace(/-/g, '+').replace(/_/g, '/');
    const pad = t + '==='.slice(0, (4 - t.length % 4) % 4);
    let bin = '';
    if (typeof atob === 'function') bin = atob(pad);
    else bin = Buffer.from(pad, 'base64').toString('binary');
    try { return decodeURIComponent(escape(bin)); } catch (e) { return ''; }
  }
  /* 只带「传给别人」需要的字段，压小链接长度 */
  function slim(it) {
    const n = norm(it); if (!n) return null;
    const o = { id: n.id, ts: n.ts, type: n.type, name: n.name, text: n.text, dev: n.dev };
    if (n.url) o.url = n.url;
    if (n.status && n.status !== '待处理') o.status = n.status;
    if (n.reply) o.reply = n.reply;
    if (n.updatedAt) o.updatedAt = n.updatedAt;
    if (n.del) o.del = 1;
    return o;
  }
  function pack(list) {
    const arr = (list || []).map(slim).filter(Boolean);
    if (!arr.length) return '';   /* 没有内容就不生成链接（shareLink 会据此返回空串） */
    return b64e(JSON.stringify(arr));
  }
  function unpack(code) {
    try {
      const arr = JSON.parse(b64d(code) || '[]');
      if (!Array.isArray(arr)) return [];
      return merge([], arr);
    } catch (e) { return []; }
  }
  /* 生成「发给组长」的链接（#fb=… 附带内容），可为一条或多条 */
  function shareLink(list) {
    const payload = pack(list);
    if (!payload) return '';
    const base = location.origin + location.pathname + location.search;
    return base + '#fb=' + payload;
  }
  /* 从当前 URL 里读 #fb= 或 ?fb= 携带的反馈 */
  function readFromUrl() {
    const h = String(location.hash || ''), s = String(location.search || '');
    const m = h.match(/[#&]fb=([A-Za-z0-9_-]+)/) || s.match(/[?&]fb=([A-Za-z0-9_-]+)/);
    if (!m) return [];
    return unpack(m[1]);
  }

  /* ---------- ② 云端：只读写「数据分支」的 data/feedback.json ---------- */
  function ctx() {
    try {
      const S = window.LMStore;
      if (!S || !S.getGhCfg || !S.ghToken) return null;
      const cfg = S.getGhCfg(), tok = S.ghToken();
      if (!cfg || !cfg.owner || !cfg.repo || !tok) return null;
      const ref = (S.dataRefOf ? S.dataRefOf(cfg) : (cfg.dataBranch || cfg.branch || 'main'));
      return {
        cfg: cfg, tok: tok, ref: ref,
        api: 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + FILE_PATH
      };
    } catch (e) { return null; }
  }
  function headers(c) {
    return { 'Authorization': 'Bearer ' + c.tok, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' };
  }
  function b64utf8(s) {
    const bytes = unescape(encodeURIComponent(String(s)));
    return (typeof btoa === 'function') ? btoa(bytes) : Buffer.from(bytes, 'binary').toString('base64');
  }
  function unb64utf8(s) {
    let bin = '';
    if (typeof atob === 'function') bin = atob(String(s).replace(/\s+/g, ''));
    else bin = Buffer.from(String(s).replace(/\s+/g, ''), 'base64').toString('binary');
    try { return decodeURIComponent(escape(bin)); } catch (e) { return ''; }
  }
  let shaCache = '';
  let lastSync = 0;
  /* 拉远端（文件还不存在 → 空列表，不算失败） */
  function pull() {
    const c = ctx();
    if (!c) return Promise.resolve({ ok: false, list: [], sha: '' });
    const h = headers(c);
    delete h['Content-Type'];
    return fetch(c.api + '?ref=' + encodeURIComponent(c.ref), { headers: h, cache: 'no-store' })
      .then(function (r) {
        if (r.status === 404) { shaCache = ''; return { ok: true, list: [], sha: '' }; }
        if (!r.ok) return { ok: false, list: [], sha: '' };
        return r.json().then(function (j) {
          shaCache = j.sha || '';
          let list = [];
          try { list = JSON.parse(unb64utf8(j.content || '') || '[]'); } catch (e) { list = []; }
          if (!Array.isArray(list)) list = [];
          return { ok: true, list: list, sha: shaCache };
        });
      })
      .catch(function () { return { ok: false, list: [], sha: '' }; });
  }
  /* 推远端（带 sha；409/422 = 别人先提交 → 清 sha，下次重新取） */
  function push(list) {
    const c = ctx();
    if (!c) return Promise.resolve(false);
    const body = {
      message: '反馈同步 ' + new Date().toLocaleString('zh-CN'),
      content: b64utf8(JSON.stringify(list)),
      branch: c.ref
    };
    if (shaCache) body.sha = shaCache;
    return fetch(c.api, { method: 'PUT', headers: headers(c), body: JSON.stringify(body) })
      .then(function (r) {
        if (r.ok) return r.json().then(function (j) { shaCache = (j.content && j.content.sha) || shaCache; return true; });
        if (r.status === 409 || r.status === 422) shaCache = '';
        return false;
      })
      .catch(function () { return false; });
  }
  /* 一站式：拉 → 合并 → 有变化再推。返回合并后的完整列表（含墓碑，由调用方过滤） */
  function sync(local) {
    const c = ctx();
    if (!c) return Promise.resolve({ ok: false, list: local || [], changed: false });
    lastSync = Date.now();
    return pull().then(function (p) {
      if (!p.ok) return { ok: false, list: local || [], changed: false };
      const before = JSON.stringify(merge(local || [], []));
      const merged = merge(local || [], p.list);
      const changed = JSON.stringify(merged) !== before;
      if (!changed) return { ok: true, list: merged, changed: false };
      return push(merged).then(function () { return { ok: true, list: merged, changed: true }; });
    });
  }
  function hasCloud() { return !!ctx(); }
  function refName() { const c = ctx(); return c ? c.ref : ''; }

  /* ---------- ③ 实时送达（EMQX 公共 MQTT）----------
     为什么不用服务器：我们本来就在用 EMQX 公共 broker 做 WebRTC 信令（免费、匿名、国内直连），
     CSP 里 connect-src 已含 wss:，所以这条路**不加依赖、不改 CSP、不要 Key**。
     关键的「设备没开机怎么收」：订阅方用固定 clientId + clean=false → 会话留在 broker 上，
     离线期间的 QoS1 消息会排队，下次连上一次性补发（已实测：离线期间 3 条全部补收到）。
     谁是「组长」：MQTT 本身没有身份。这里的做法是 **只有进入管理员模式的设备才订阅**
     （要输管理密码），访客只发不收 —— 属「软隔离」，防误看而非防破解；
     真正的机密请用下一步的口令加密（README 修复92 的隐私说明）。 */
  var MQ = { client: null, onItem: null, topic: '', url: '', keep: 0 };
  /* 离线补收窗口：向 broker 申请的会话保留秒数（MQTT5）。
     实测公共 broker 的实际上限：EMQX 21600 秒（6 小时）、HiveMQ 1800 秒（30 分钟）；
     broker 会在 CONNACK 里回它真正给的值，我们以那个为准（见 listen 里的 MQ.keep）。 */
  var MQ_KEEP_REQ = 21600;
  function djb2(s) {
    var h = 5381; s = String(s || '');
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0);
  }
  function win() { return (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {}); }
  /* 主题 / broker 派生：与 yjs-config.js 的房间口令同源 → 同一房间的设备天然算出同一台 broker、同一主题 */
  function mqCfg() {
    var C = (win().LMYJS_CONFIG) || {};
    var brokers = (C.mqtt && C.mqtt.brokers && C.mqtt.brokers.length)
      ? C.mqtt.brokers : ['wss://broker-cn.emqx.io:8084/mqtt'];
    var hv = djb2((C.room || 'living-maps') + '|' + (C.password || ''));
    return { url: brokers[hv % brokers.length], topic: 'lm/' + hv.toString(36) + '/fb' };
  }
  function devTag() {
    try {
      var k = 'lm_fb_devtag_v1', v = win().localStorage && localStorage.getItem(k);
      if (!v) { v = Math.random().toString(36).slice(2, 10); localStorage.setItem(k, v); }
      return v;
    } catch (e) { return 'anon'; }
  }
  function mqReady() { var w = win(); return !!(w.mqtt && w.mqtt.connect); }
  function mqOpen(admin) {
    if (!mqReady()) return null;
    var c = mqCfg(), w = win();
    var cid = 'lmfb-' + c.topic.replace(/[^0-9a-z]/gi, '') + '-' + devTag()
      + (admin ? '' : '-' + Math.random().toString(36).slice(2, 7));
    var o = {
      protocolVersion: 5, clientId: cid, clean: !admin,
      connectTimeout: 8000, reconnectPeriod: admin ? 6000 : 0, keepalive: 60
    };
    /* 只有「要补收」的订阅方需要显式申请会话保留；发布方 clean=true，发了就完事 */
    if (admin) o.properties = { sessionExpiryInterval: MQ_KEEP_REQ };
    try {
      return w.mqtt.connect(c.url, o);
    } catch (e) { return null; }
  }
  /* 组长/管理员：订阅并持续接收（clean=false → 离线期间的留言会被 broker 攒着，下次连上补收） */
  function listen(onItem) {
    if (!mqReady()) return function () {};
    if (MQ.client) { MQ.onItem = onItem; return function () {}; }
    var c = mqCfg(), cl = mqOpen(true);
    if (!cl) return function () {};
    MQ.client = cl; MQ.onItem = onItem; MQ.topic = c.topic; MQ.url = c.url;
    cl.on('connect', function (ck) {
      /* ★ 修复94：MQTT5 CONNACK 会回 broker 真正给的会话保留秒数 → 记下来，界面如实显示「能补收多久」 */
      try {
        var p = (ck && ck.properties) || {};
        if (p.sessionExpiryInterval != null) MQ.keep = +p.sessionExpiryInterval;
      } catch (eK) { /* noop */ }
      try { cl.subscribe(c.topic, { qos: 1 }); } catch (e) { /* noop */ }
    });
    cl.on('message', function (t, p) {
      if (t !== c.topic) return;
      var it = null;
      try {
        var o = JSON.parse(String(p));
        if (o && o.t === 'lmfb1' && o.it) it = o.it;
      } catch (e) { it = null; }
      if (!it || !it.id || !it.text) return;
      if (String(it.text).length > 1000 || String(it.id).length > 40) return;   /* 防垃圾塞爆 */
      var n = norm(it);
      if (!n) return;
      try { if (MQ.onItem) MQ.onItem(n); } catch (e2) { /* noop */ }
    });
    return function () { try { cl.end(true); } catch (e) { /* noop */ } MQ.client = null; };
  }
  /* 任何人（含访客）：把一条留言发出去（QoS1）。失败返回 false，由调用方给「复制链接」兜底 */
  function publish(item) {
    if (!mqReady()) return Promise.resolve(false);
    var it = slim(item);
    if (!it) return Promise.resolve(false);
    var c = mqCfg(), cl = mqOpen(false);
    if (!cl) return Promise.resolve(false);
    return new Promise(function (res) {
      var done = false;
      function fin(v) { if (done) return; done = true; try { cl.end(true); } catch (e) { /* noop */ } res(v); }
      cl.on('connect', function () {
        try {
          cl.publish(c.topic, JSON.stringify({ t: 'lmfb1', it: it }), { qos: 1 },
            function (e) { fin(!e); });
        } catch (e) { fin(false); }
      });
      cl.on('error', function () { fin(false); });
      setTimeout(function () { fin(false); }, 9000);
    });
  }
  function mqInfo() {
    var c = mqCfg();
    return {
      url: MQ.url || c.url, topic: MQ.topic || c.topic, on: !!MQ.client,
      keep: MQ.keep || MQ_KEEP_REQ,                /* 离线补收窗口（秒），优先用 broker 回的 */
      keepText: (function (s) {
        if (s >= 3600) return '约 ' + Math.round(s / 3600 * 10) / 10 + ' 小时';
        if (s >= 60) return '约 ' + Math.round(s / 60) + ' 分钟';
        return '约 ' + s + ' 秒';
      })(MQ.keep || MQ_KEEP_REQ)
    };
  }

  return {
    merge: merge, norm: norm, pack: pack, unpack: unpack, slim: slim,
    shareLink: shareLink, readFromUrl: readFromUrl,
    pull: pull, push: push, sync: sync, hasCloud: hasCloud, refName: refName,
    path: FILE_PATH, lastSyncAt: function () { return lastSync; },
    publish: publish, listen: listen, mqInfo: mqInfo, mqCfg: mqCfg
  };
})();
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}));
if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : globalThis).LMFB;
