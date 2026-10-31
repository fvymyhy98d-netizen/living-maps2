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
  function pick(it, a, b) { var v = it[a]; if (v == null || v === '') v = it[b]; return String(v == null ? '' : v).slice(0, 300); }
  function norm(it) {
    if (!it || typeof it !== 'object' || !it.id) return null;
    const o = {
      id: String(it.id), ts: +it.ts || 0, type: String(it.type || ''),
      name: String(it.name || '匿名').slice(0, 30), text: String(it.text || ''),
      dev: String(it.dev || ''), url: String(it.url || ''),
      status: fixStatus(it.status), reply: String(it.reply || '').slice(0, 200),
      /* ★ 修复95：老师要求「反馈必须得到回应」的四段记录
         ★ 修复96：也认 Supabase 表里常被改名的 *_note 别名（避免 SQL 关键字冲突） */
      check: pick(it, 'check', 'check_note'),    /* 我们怎样核实 */
      change: pick(it, 'change', 'change_note'),  /* 修改了什么 */
      why: pick(it, 'why', 'why_note')            /* 为什么调整 / 为什么保留原判断 */
    };
    o.updatedAt = +it.updatedAt || o.ts || 0;
    if (it.del) o.del = 1;
    return o;
  }
  /* ★ 修复95：状态统一（旧数据的 处理中/已处理 自动迁移） */
  var STS = ['待处理', '已采纳', '已修改', '保留原判断'];
  function fixStatus(s) {
    var t = String(s == null ? '' : s).trim();
    if (STS.indexOf(t) >= 0) return t;
    if (t === '处理中') return '已采纳';
    if (t === '已处理') return '已修改';
    return '待处理';
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
    if (n.check) o.check = n.check;      /* ★ 修复95：处理记录也要传给别人 */
    if (n.change) o.change = n.change;
    if (n.why) o.why = n.why;
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
  /* ---------- ②b 公开读取（★ 修复95：访客没有 Token 也能看到大家的反馈）----------
     反馈文件放在**公开仓库**的数据分支上，所以 raw.githubusercontent.com 可直接读，不需要任何凭据。
     owner/repo：管理员设备用已绑定配置；访客从网址推导（<owner>.github.io/<repo>/）。
     ref：管理员用配置的数据分支；访客默认 lm-data（读不到再退回 main）。 */
  function publicCtx() {
    var S = win().LMStore, cfg = null;
    try { cfg = (S && S.getGhCfg) ? S.getGhCfg() : null; } catch (e) { cfg = null; }
    var owner = (cfg && cfg.owner) || '', repo = (cfg && cfg.repo) || '', ref = '';
    if (!owner || !repo) {
      try {
        var h = String(win().location && location.hostname || '');
        var p = String(win().location && location.pathname || '');
        var m = h.match(/^([^.]+)\.github\.io$/i);
        var seg = p.split('/')[1] || '';
        if (m && seg) { owner = m[1]; repo = seg.replace(/\.git$/, ''); }
      } catch (e2) { /* noop */ }
    }
    if (!owner || !repo) return null;
    try { if (S && S.dataRefOf && cfg) ref = S.dataRefOf(cfg); } catch (e3) { ref = ''; }
    if (!ref) ref = 'lm-data';
    return { owner: owner, repo: repo, ref: ref };
  }
  function publicUrl(c, ref) {
    return 'https://raw.githubusercontent.com/' + c.owner + '/' + c.repo + '/'
      + encodeURIComponent(ref || c.ref) + '/' + FILE_PATH + '?t=' + Date.now();
  }
  /* 依次尝试 [数据分支, main]，谁都读不到就返回 ok:false（前端静默，不影响留言） */
  function pullPublic() {
    var c = publicCtx();
    if (!c) return Promise.resolve({ ok: false, list: [], why: '无法推导仓库' });
    var refs = [c.ref];
    if (c.ref !== 'main') refs.push('main');
    var i = 0;
    function tryNext() {
      if (i >= refs.length) return Promise.resolve({ ok: false, list: [], why: 'raw 读取失败' });
      var ref = refs[i++];
      return fetch(publicUrl(c, ref), { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) return tryNext();
          return r.text().then(function (t) {
            var list = [];
            try { list = JSON.parse(t); } catch (e) { list = []; }
            if (!Array.isArray(list)) return tryNext();
            return { ok: true, list: list, ref: ref, url: publicUrl(c, ref) };
          });
        })
        .catch(tryNext);
    }
    return tryNext();
  }

  /* ---------- ②c 云存档（★ 修复96）：把「写」放在提交者的浏览器里 ----------
     为什么需要它：公共 MQTT 的离线补收窗口只有 6 小时（broker 白送的额度，改不了），
     而「谁都没开网页」时根本没人去收 —— 只要同学点「发送」的那一刻就把数据写进一个
     **永久存储**，就不需要任何人在线，也不受 6 小时限制；下次谁打开反馈页都会自动拉回来。
     三种适配（管理员在「反馈处理」面板里填，任选其一）：
       ① supabase —— 免费 Postgres；anon key 设计上就可以公开，靠 RLS 只允许 insert / 允许读；
       ② worker   —— 自建 Cloudflare Worker（免费）：POST 收 JSON、GET 返回数组，一个网址够了；
       ③ webhook  —— 飞书 / 钉钉 / 企业微信群机器人：只负责「立刻通知到手机」，不读回。
     配置存在内容里（config.fbCloud）——端点必须对**所有访客**可见，否则他们写不进去。 */
  function contentCfg() {
    try {
      var A = win().LMApp, c = A && A.state && A.state.content;
      var f = c && c.config && c.config.fbCloud;
      return (f && typeof f === 'object') ? f : null;
    } catch (e) { return null; }
  }
  function cloudCfg() {
    var f = contentCfg();
    if (!f) return null;
    var kind = String(f.kind || '').trim().toLowerCase();
    var url = String(f.url || '').trim().replace(/\/+$/, '');
    if (!kind || kind === 'off' || kind === 'none' || !url) return null;
    if (!/^https:\/\//i.test(url)) return null;          /* 只允许 https，避免明文与混合内容 */
    if (kind === 'supabase') {
      var key = String(f.key || '').trim();
      if (!key) return null;
      /* ★ 修复97：手滑把 Project Settings 里的 `/rest/v1` 也复制进 URL 时自动纠正。
         否则 cloudList / cloudSave 会再拼一次 → `/rest/v1/rest/v1/<表>` → 恒 404。 */
      url = url.replace(/\/rest\/v1$/i, '').replace(/\/+$/, '');
      return { kind: 'supabase', url: url, key: key, table: String(f.table || 'lm_feedback').trim() || 'lm_feedback' };
    }
    if (kind === 'worker' || kind === 'webhook') return { kind: kind, url: url };
    return null;
  }
  function cloudInfo() {                                  /* 给界面看（不显示 key） */
    var c = cloudCfg();
    if (!c) return { on: false, kind: '', host: '', text: '未配置（只能靠 MQTT / GitHub / 链接）' };
    var host = '?';
    try { host = String(c.url).replace(/^https:\/\//i, '').split('/')[0]; } catch (e) { /* noop */ }
    var label = c.kind === 'supabase' ? 'Supabase' : (c.kind === 'worker' ? '自建 Worker' : '群机器人（只提醒）');
    return { on: true, kind: c.kind, host: host, text: label + ' · ' + host };
  }
  /* 写一条：成功返回 true。失败一律静默（不能因为云存档挂了就让人发不出留言） */
  function cloudSave(item) {
    var c = cloudCfg(), it = slim(item);
    if (!c || !it) return Promise.resolve(false);
    try {
      if (c.kind === 'webhook') return hookSend(c.url, it);
      if (c.kind === 'supabase') {
        return fetch(c.url + '/rest/v1/' + encodeURIComponent(c.table), {
          method: 'POST', cache: 'no-store',
          headers: {
            'Content-Type': 'application/json', apikey: c.key,
            Authorization: 'Bearer ' + c.key, Prefer: 'return=minimal'
          },
          body: JSON.stringify(it)
        }).then(function (r) { return !!r && r.ok; }).catch(function () { return false; });
      }
      /* worker 约定：POST 收 { t:'lmfb1', it }，GET 返回数组 */
      return fetch(c.url, {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: 'lmfb1', it: it })
      }).then(function (r) { return !!r && r.ok; }).catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }
  /* 群机器人：飞书 / 钉钉 / 企业微信 三种 body 都兼容（无关字段对方会忽略） */
  function hookSend(url, it) {
    var text = '📥 新反馈 ' + it.id + '\n' + (it.name || '匿名') + ' · ' + (it.type || '')
      + '\n' + String(it.text || '').slice(0, 500) + (it.url ? '\n' + it.url : '');
    var body = { msgtype: 'text', text: { content: text } };        /* 钉钉 / 企业微信 */
    if (/feishu|larksuite/i.test(url)) body = { msg_type: 'text', content: JSON.stringify({ text: text }) };
    return fetch(url, {
      method: 'POST', mode: 'no-cors', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function () { return true; }).catch(function () { return false; });
  }
  /* ★ 修复97：把 HTTP 错误翻译成「照着改」的提示。
     起因：面板只显示「读取失败：HTTP 404」，看不出是「表没建」「表名错」「key 没复制全」
     还是「项目被暂停（免费版闲置 7 天）」。PostgREST 的错误体里其实写得很清楚
     （PGRST205 表不在 schema cache / 42501 权限不足 / 42P01 关系不存在），这里统一翻成人话。 */
  function whyText(status, body) {
    var code = '', msg = '';
    var s = String(body == null ? '' : body).trim();
    if (s.charAt(0) === '{') {
      try {
        var j = JSON.parse(s);
        code = String(j.code || j.error || '');
        msg = String(j.message || j.error_description || j.hint || '');
      } catch (e) { msg = s.slice(0, 140); }
    } else if (s) {
      msg = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 140);
    }
    var both = code + ' ' + msg;
    var head = 'HTTP ' + status + (code ? ' · ' + code : '') + (msg ? ' · ' + msg : '');
    if (status === 404 || /PGRST205|42P01|does not exist|schema cache/i.test(both)) {
      return head + ' → 表不在 public：核对上面填的「表名」，或先去 SQL Editor 跑建表 SQL';
    }
    if (status === 401 || /PGRST30[01]|JWT|No API key|invalid api key/i.test(both)) {
      return head + ' → anon key 不对 / 没复制全（Project Settings → API 的 anon public 整串）';
    }
    if (status === 403 || /42501|permission denied/i.test(both)) {
      return head + ' → 权限不足：补跑 SQL 里的 grant select, insert … to anon';
    }
    if (status === 503 || /paused|restore|unavailable/i.test(both)) {
      return head + ' → 项目被暂停（免费版闲置 7 天）：去 Dashboard 点 Restore 即可恢复';
    }
    return head;
  }
  /* 读全部：supabase 直接查表；worker 直接 GET；webhook 读不了 */
  function cloudList() {
    var c = cloudCfg();
    if (!c) return Promise.resolve({ ok: false, list: [], why: '未配置' });
    if (c.kind === 'webhook') return Promise.resolve({ ok: false, list: [], why: '群机器人只能提醒、不能读回' });
    var url, opt;
    if (c.kind === 'supabase') {
      url = c.url + '/rest/v1/' + encodeURIComponent(c.table) + '?select=*&order=ts.asc&limit=1000';
      opt = { cache: 'no-store', headers: { apikey: c.key, Authorization: 'Bearer ' + c.key } };
    } else {
      url = c.url; opt = { cache: 'no-store' };
    }
    try {
      return fetch(url, opt).then(function (r) {
        if (!r || !r.ok) {                          /* ★ 修复97：读出错误体再翻译，别只说「HTTP 404」 */
          var st = (r && r.status) || 0, bad = { ok: false, list: [], why: 'HTTP ' + st, status: st };
          if (!r) return bad;
          var rd = r.text ? r.text()
            : (r.json ? r.json().then(function (j) { return JSON.stringify(j); }) : Promise.resolve(''));
          return Promise.resolve(rd)
            .then(function (b) { bad.why = whyText(st, b); return bad; })
            .catch(function () { return bad; });
        }
        return r.json().then(function (j) {
          var arr = Array.isArray(j) ? j : (j && Array.isArray(j.items) ? j.items : []);
          return { ok: true, list: arr, why: '' };
        });
      }).catch(function () { return { ok: false, list: [], why: '网络失败（CSP / 域名白名单）' }; });
    } catch (e) { return Promise.resolve({ ok: false, list: [], why: String(e && e.message || e) }); }
  }


  /* ---------- ②d 粘贴导入（★ 修复96）：云文档导出后直接粘进来 ----------
     适用：飞书多维表格 / 腾讯文档 / 金山文档 / Excel —— 导出或直接框选复制，带表头粘进文本框。
     表头按中英文同义词匹配（时间/称呼/类型/内容…），没认出来就按「时间, 称呼, 类型, 内容」兜底。
     也支持直接粘 JSON 数组（[{id,ts,text,...}]）。重复导入不会翻倍：id 稳定 + 按 updatedAt 合并。 */
  var COLS = {
    id: ['id', '编号', '序号'],
    ts: ['ts', 'time', '日期', '时间', '提交时间', '创建时间', '填写时间'],
    type: ['type', '类型', '分类', '反馈类型'],
    name: ['name', '称呼', '昵称', '姓名', '填写人'],
    text: ['text', '内容', '留言', '反馈', '建议', '意见', '反馈内容'],
    url: ['url', '链接', '相关链接'],
    status: ['status', '状态', '处理状态'],
    reply: ['reply', '回复', '小组回复'],
    check: ['check', '核实', '怎样核实', '核实情况'],
    change: ['change', '修改', '修改了什么', '处理结果'],
    why: ['why', '理由', '为什么', '原因']
  };
  function hash36s(s) {
    var h = 5381; s = String(s || '');
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  /* 一行 CSV/TSV → 字段数组（支持 "引号包裹的逗号" 与 "" 转义） */
  function splitRow(line, sep) {
    var out = [], cur = '', q = false, i = 0;
    while (i < line.length) {
      var ch = line.charAt(i);
      if (q) {
        if (ch === '"') {
          if (line.charAt(i + 1) === '"') { cur += '"'; i += 2; continue; }
          q = false; i++; continue;
        }
        cur += ch; i++; continue;
      }
      if (ch === '"') { q = true; i++; continue; }
      if (ch === sep) { out.push(cur); cur = ''; i++; continue; }
      cur += ch; i++;
    }
    out.push(cur);
    return out;
  }
  function parseImport(text) {
    var raw = String(text == null ? '' : text).replace(/^\uFEFF/, '').trim();
    if (!raw) return [];
    /* ① JSON 数组 / {items:[]} */
    if (raw.charAt(0) === '[' || raw.charAt(0) === '{') {
      var j = null;
      try { j = JSON.parse(raw); } catch (e) { j = null; }
      if (j) {
        var arr = Array.isArray(j) ? j : (Array.isArray(j.items) ? j.items : null);
        if (arr) return arr.map(norm).filter(Boolean);
      }
    }
    /* ② 表格：自动判分隔符（制表符 = Excel/飞书直接粘贴；逗号 = CSV） */
    var lines = raw.split(/\r\n|\n|\r/).filter(function (l) { return String(l).trim() !== ''; });
    if (!lines.length) return [];
    var head = lines[0];
    var sep = (head.split('\t').length > head.split(',').length) ? '\t' : ',';
    var cells = splitRow(head, sep).map(function (s) { return String(s).trim().toLowerCase(); });
    var map = {};
    Object.keys(COLS).forEach(function (k) {
      for (var i = 0; i < cells.length; i++) {
        if (COLS[k].indexOf(cells[i]) >= 0) { map[k] = i; break; }
      }
    });
    /* 一行表头都没认出来 → 当「没有表头」，全部行都是数据，按常见列序 时间/称呼/类型/内容 兜底 */
    var hasHeader = Object.keys(map).length > 0;
    if (!hasHeader) { map.ts = 0; map.name = 1; map.type = 2; map.text = 3; }
    var out = [], hasText = map.text != null;
    for (var n = (hasHeader ? 1 : 0); n < lines.length; n++) {
      var c = splitRow(lines[n], sep).map(function (s) { return String(s).trim(); });
      var get = function (k) { return (map[k] != null && c[map[k]] != null) ? c[map[k]] : ''; };
      var txt = (hasText ? get('text') : (c[3] || c[2] || '')).slice(0, 800);
      if (!txt) continue;
      var tsRaw = get('ts'), ts = NaN;
      if (tsRaw) ts = Date.parse(String(tsRaw).replace(/[./]/g, '-').replace(/\s+/, ' '));
      if (!isFinite(ts)) ts = Date.now() + n;                 /* 没时间列 → 按导入顺序排 */
      var id = get('id') || ('F-' + hash36s(ts + '|' + txt).slice(0, 6).toUpperCase());
      out.push(norm({
        id: id, ts: ts, type: get('type') || '导入', name: get('name') || '匿名',
        text: txt, url: get('url'), dev: 'import',
        status: get('status') || '待处理', reply: get('reply'),
        check: get('check'), change: get('change'), why: get('why'),
        updatedAt: Date.now()
      }));
    }
    return out.filter(Boolean);
  }

  function hasCloud() { return !!ctx(); }
  function refName() { const c = ctx(); return c ? c.ref : ''; }

  /* ---------- ③ 实时送达（EMQX 公共 MQTT）----------
     为什么不用服务器：我们本来就在用 EMQX 公共 broker 做 WebRTC 信令（免费、匿名、国内直连），
     CSP 里 connect-src 已含 wss:，所以这条路**不加依赖、不改 CSP、不要 Key**。
     关键的「设备没开机怎么收」：订阅方用固定 clientId + clean=false → 会话留在 broker 上，
     离线期间的 QoS1 消息会排队，下次连上一次性补发（已实测：离线期间 3 条全部补收到）。
     ★ 修复95：反馈改为「像讨论区一样对所有人可见」——
       · 访客也订阅（clean=true + 随机 clientId → 只收在线期间的新留言，不占会话、不补收）；
       · 历史列表由 pullPublic() 从公开仓库 raw 拉（不需要 Token）；管理员另有 API 同步。
       · 管理员（输入密码后）仍用 clean=false + 固定 clientId → 关机期间也能补收。
     主题由「房间 + 口令」哈希派生，属「软隔离」：防误看，不防破解（公共 broker 明文）。 */
  var MQ = { client: null, onItem: null, topic: '', url: '', keep: 0, admin: false };
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
  /* 订阅并持续接收。opts.visitor=true → 访客只读实时流（clean=true，不占 broker 会话、不补收历史，
     历史由 pullPublic() 从 raw 拉）。管理员：clean=false + 固定 clientId → 关机期间的会补收。 */
  function listen(onItem, opts) {
    if (!mqReady()) return function () {};
    var asAdmin = !(opts && opts.visitor);
    if (MQ.client) {
      if (MQ.admin === asAdmin) { MQ.onItem = onItem; return function () {}; }
      try { MQ.client.end(true); } catch (e0) { /* noop */ }
      MQ.client = null;
    }
    var c = mqCfg(), cl = mqOpen(asAdmin);
    if (!cl) return function () {};
    MQ.client = cl; MQ.onItem = onItem; MQ.topic = c.topic; MQ.url = c.url; MQ.admin = asAdmin;
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
    publish: publish, listen: listen, mqInfo: mqInfo, mqCfg: mqCfg,
    /* ★ 修复95：公开可见 + 状态/处理记录 */
    pullPublic: pullPublic, publicCtx: publicCtx, publicUrl: publicUrl,
    fixStatus: fixStatus, statuses: STS.slice(),
    /* ★ 修复96：云存档（永久收件箱，不受 6 小时限制）+ 粘贴导入 */
    cloudCfg: cloudCfg, cloudInfo: cloudInfo, cloudSave: cloudSave, cloudList: cloudList,
    parseImport: parseImport, contentCfg: contentCfg, cloudWhy: whyText
  };
})();
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}));
if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : globalThis).LMFB;
