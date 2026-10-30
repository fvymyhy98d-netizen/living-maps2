/* =========================================================
   实时协作 lm_collab_v2 —— 把「页面内容」在多台设备 / 多个窗口之间实时同步
   传输层自动叠加（零配置，能连几层连几层）：
     ① 本机互连：BroadcastChannel——同一浏览器的多标签/多窗口毫秒级同步（演示最方便）
     ② 课堂服务器：node server.js 启动后页面被注入 window.LM_COLLAB_SERVER=1
        → 同一 WiFi 下任何设备打开即接入（SSE 实时推送），课堂演示兜底（方案 B）
     ③ 云端（GitHub 仓库直存，方案 A 的作业级实现）：
        - 管理员设备：已用「☁ 同步」绑定过仓库 + Token → 每次保存自动提交到
          data/content.js（GitHub Pages 随之自动重新发布），并 6 秒级轮询别人提交的新版本
        - 访客设备：在 GitHub Pages 上打开时，从网址自动推导 owner/repo（无需任何配置），
          每 90 秒读一次仓库最新内容 → 自己电脑关机、跨城市也能协同 ✓
   同步范围：页面正文（含跳转映射、协作配置/屏蔽名单）；反馈/讨论区不参与
   冲突策略：提交级「后写优先」（时间戳，旧包忽略）+ 编辑占位锁（✍ 正在编辑角标）
             + 本地正在输入/弹窗/拖拽时远端更新自动暂存，手一松立即套用
   设备识别：设备号 = 随机持久号 + 设备指纹（canvas/UA/屏幕等，清浏览器数据也基本不变）；
             昵称可改（⚙ 设置 → 协作与设备），同昵称多设备允许，靠设备号区分
   屏蔽机制：管理员可屏蔽某设备「进网页（游客）」或「进管理员模式」，名单随内容同步，
             每条记录带管理密码派生的 HMAC 签名（无密码者无法伪造/篡改）
   ========================================================= */
window.LMCollab = (function () {
  'use strict';
  var TS_KEY = 'lm_collab_ts_v1', DEV_KEY = 'lm_collab_dev_v1', NAME_KEY = 'lm_collab_name_v1',
      ROSTER_KEY = 'lm_collab_roster_v1', CHIP_ID = 'collabChip', PANEL_ID = 'collabPanel', MASK_ID = 'banMask';
  var LOCK_TTL = 12000, LOCK_BEAT = 4000, PEER_TTL = 25000;
  var GH_PUSH_MIN = 6000, POLL_ACTIVE = 2000, POLL_IDLE = 8000, POLL_HIDDEN = 60000, POLL_VISITOR = 90000;
  var me = readDevice();
  var lastTs = +(localStorage.getItem(TS_KEY) || 0);
  var peers = {};    /* 设备id -> {name, fp, ts, page} */
  var locks = {};    /* '页面id:块号' -> {by, name, ts} */
  var myLock = null;
  var pending = null;
  var pointerDown = false;
  var transports = []; /* 可同时挂多层：bc / server / gh */
  var modeLabel = '本机互连';

  /* ---------- 设备身份：随机持久号 + 指纹（清存储后仍可被识别） ---------- */
  function fnv1a(s) {
    let h = 0x811c9dc5;
    s = String(s);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function fingerprint() {
    let sig = '';
    try {
      const c = document.createElement('canvas');
      c.width = 220; c.height = 40;
      const x = c.getContext('2d');
      if (x) {
        x.textBaseline = 'top'; x.font = '15px "Arial"';
        x.fillStyle = '#f60'; x.fillRect(0, 0, 90, 18);
        x.fillStyle = '#06c'; x.fillText('活地图·lm-collab-v2·指纹', 2, 4);
        sig += c.toDataURL().slice(-96);
      }
    } catch (e) { /* noop */ }
    sig += '|' + navigator.userAgent + '|' + navigator.language + '|' + (navigator.hardwareConcurrency || 0)
      + '|' + screen.width + 'x' + screen.height + 'x' + (screen.colorDepth || 0)
      + '|' + (new Date().getTimezoneOffset()) + '|' + (navigator.maxTouchPoints || 0);
    return fnv1a(sig);
  }
  function readDevice() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(DEV_KEY) || 'null'); } catch (e) { /* noop */ }
    if (!d || !d.id) d = { id: 'D' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), created: Date.now() };
    d.fp = fingerprint();
    d.name = readName(d);
    try { localStorage.setItem(DEV_KEY, JSON.stringify(d)); } catch (e2) { /* noop */ }
    return d;
  }
  function readName(d) {
    /* 改过的昵称 > 讨论区昵称 > 设备编号 */
    try {
      const n = localStorage.getItem(NAME_KEY);
      if (n && String(n).trim()) return String(n).trim().slice(0, 16);
    } catch (e) { /* noop */ }
    try {
      const cm = JSON.parse(localStorage.getItem('lm_device_v1') || 'null');
      if (cm && cm.nick && String(cm.nick).trim()) return String(cm.nick).trim().slice(0, 16);
    } catch (e2) { /* noop */ }
    return '设备' + String(d.id).slice(-4);
  }
  function setName(n) {
    n = String(n || '').trim().slice(0, 16);
    if (!n) return false;
    try { localStorage.setItem(NAME_KEY, n); } catch (e) { return false; }
    me.name = n;
    try { const d = JSON.parse(localStorage.getItem(DEV_KEY) || '{}'); d.name = n; localStorage.setItem(DEV_KEY, JSON.stringify(d)); } catch (e2) { /* noop */ }
    hello(); paintChip(); renderPanel();
    return true;
  }
  function shortId(id) { return String(id || '').slice(-6).toUpperCase(); }
  /* ---------- 已知设备花名册（含离线设备，供管理员屏蔽管理） ---------- */
  function roster() {
    try { const r = JSON.parse(localStorage.getItem(ROSTER_KEY) || '{}'); return (r && typeof r === 'object') ? r : {}; } catch (e) { return {}; }
  }
  function rosterTouch(id, name, fp, page) {
    if (!id) return;
    const r = roster();
    const o = r[id] || { firstSeen: Date.now() };
    o.name = name || o.name || ''; o.fp = fp || o.fp || ''; o.page = page || o.page || '';
    o.lastSeen = Date.now();
    r[id] = o;
    try { localStorage.setItem(ROSTER_KEY, JSON.stringify(r)); } catch (e) { /* noop */ }
  }
  function rosterList() {
    const r = roster(), out = [];
    Object.keys(r).forEach(function (k) { out.push(Object.assign({ id: k }, r[k])); });
    out.sort(function (a, b) { return (b.lastSeen || 0) - (a.lastSeen || 0); });
    return out;
  }
  /* ---------- 消息收发 ---------- */
  function validContent(c) { return !!c && Array.isArray(c.pages); }
  function bump(ts) { ts = +ts || 0; if (ts > lastTs) { lastTs = ts; try { localStorage.setItem(TS_KEY, String(ts)); } catch (e) { /* noop */ } } }
  function send(msg) {
    msg = msg || {}; msg.t = 'lm1'; msg.from = me.id; msg.name = me.name; msg.fp = me.fp; msg.ts = Date.now();
    transports.forEach(function (tr) { try { tr.send(msg); } catch (e) { /* noop */ } });
  }
  function localBusy() {
    if (!window.LMApp) return true;
    if (document.querySelector('.modal-mask,.crop-overlay')) return true;
    if (pointerDown) return true;
    const ae = document.activeElement;
    if (ae && (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) return true;
    return false;
  }
  /* ---------- 冲突保护②：块级后写优先 ----------
     编辑保存时给被改的块打 _ts（editor.js touchBlock）。应用远端整包前逐块比较：
     页结构 / 块数一致时，「谁改这个块更晚谁赢」——A 改第 3 块、B 改第 5 块，两边都不丢；
     结构不一致（插入/删除/调序）时退回提交级后写优先（整包），与历史版本兼容 */
  function mergeBlocks(c) {
    try {
      const base = window.LMApp ? LMApp.state.content : null;
      if (!base || !Array.isArray(base.pages) || !Array.isArray(c.pages)) return c;
      if (base.pages.length !== c.pages.length) return c;
      for (let i = 0; i < base.pages.length; i++) {
        if ((base.pages[i] && base.pages[i].id) !== (c.pages[i] && c.pages[i].id)) return c;
      }
      c.pages.forEach(function (rp, i) {
        const bp = base.pages[i];
        if (!bp || !rp || !Array.isArray(bp.blocks) || !Array.isArray(rp.blocks)) return;
        if (bp.blocks.length !== rp.blocks.length) return; /* 该页结构变了 → 整页取远端 */
        rp.blocks.forEach(function (rb, j) {
          const bb = bp.blocks[j];
          if (!bb || !rb) return;
          if (JSON.stringify(bb) === JSON.stringify(rb)) return;
          const bt = +bb._ts || 0, rt = +rb._ts || 0;
          if (bt > rt) rp.blocks[j] = bb; /* 本机这个块改得更晚 → 保留本机（后写优先到块级） */
        });
      });
    } catch (e) { /* 任何异常都退回整包 */ }
    return c;
  }
  /* ---------- 设备状态双向可见：花名册随内容同步 ----------
     每台设备把「我 + 我见过的设备」写进 content.config.collab.roster（lastSeen 新者胜），
     随 commit 广播 / 上云；应用远端内容时再并回本机花名册 ——
     跨网络、跨通道的设备也能互相看到「谁在线、最近活跃、在哪个页面」 */
  function rosterSync(c) {
    try {
      if (!c) return;
      const cfg = c.config = c.config || {};
      const cb = cfg.collab = cfg.collab || {};
      const cur = (cb.roster && typeof cb.roster === 'object') ? cb.roster : {};
      const mine = roster();
      Object.keys(mine).forEach(function (k) {
        const o = cur[k];
        if (!o || (+mine[k].lastSeen || 0) >= (+o.lastSeen || 0)) cur[k] = mine[k];
      });
      const keys = Object.keys(cur);
      if (keys.length > 200) { /* 上限 200 台：最久没上线的先剔除 */
        keys.sort(function (a, b) { return (+cur[a].lastSeen || 0) - (+cur[b].lastSeen || 0); })
          .slice(0, keys.length - 200).forEach(function (k) { delete cur[k]; });
      }
      cb.roster = cur;
    } catch (e) { /* noop */ }
  }
  function rosterFromRemote(c) {
    try {
      const list = (((c || {}).config || {}).collab || {}).roster;
      if (!list || typeof list !== 'object') return;
      const mine = roster();
      Object.keys(list).forEach(function (k) {
        const o = list[k];
        if (!o || (!o.name && !o.fp)) return;
        const cur2 = mine[k];
        if (!cur2 || (+o.lastSeen || 0) > (+cur2.lastSeen || 0)) {
          mine[k] = { name: o.name || '', fp: o.fp || '', firstSeen: o.firstSeen || o.lastSeen || Date.now(), lastSeen: +o.lastSeen || 0, page: o.page || '' };
        }
      });
      try { localStorage.setItem(ROSTER_KEY, JSON.stringify(mine)); } catch (e2) { /* noop */ }
    } catch (e) { /* noop */ }
  }
  /* ---------- 改动动态（WPS 式「谁改了什么」流水）----------
     块级 _t 时间戳（后写优先的落款）就是天然的 diff 依据：合并前后比页面签名，
     变了的页面进流水（最多 12 条），显示在协同比章面板 —— 不新增任何传输内容 */
  var feed = [];
  function pushFeed(by, page) {
    feed.unshift({ ts: Date.now(), by: String(by || '其他设备'), page: String(page || '') });
    if (feed.length > 12) feed.length = 12;
    try {
      const panNow = document.getElementById(PANEL_ID);
      if (panNow && panNow.classList.contains('show')) renderPanel();
    } catch (e) { /* noop */ }
  }
  function pushFeedFrom(before, after, by) {
    const sigOf = function (p) { return ((p && p.blocks) || []).map(function (b) { return (b && b._t) || 0; }).join(',') + '|' + ((p && p.title) || ''); };
    const oldSig = {};
    ((before && before.pages) || []).forEach(function (p) { if (p && p.id) oldSig[p.id] = sigOf(p); });
    ((after && after.pages) || []).forEach(function (p) {
      if (!p || !p.id) return;
      if (oldSig[p.id] !== sigOf(p)) pushFeed(by, p.title || p.id);
    });
  }
  function doApply(c, ts, by) {
    bump(ts);
    /* 讨论区保护：远端整包覆盖前，把本机还没广播出去的新发言并进去（id 并集 + 墓碑），防止丢评论 */
    try {
      if (window.LMCommunity && window.LMApp && Array.isArray(LMApp.state.content && LMApp.state.content.discuss)) {
        c.discuss = window.LMCommunity.merge(c.discuss || [], LMApp.state.content.discuss);
      }
    } catch (e0) { /* noop */ }
    rosterFromRemote(c);           /* 设备名单双向可见 */
    c = mergeBlocks(c);            /* 块级后写优先（见上方注释） */
    const before = LMApp.state.content;
    let same = false;              /* 内容一模一样（重复帧 / 别人保存但没改东西）→ 不重绘不提示：
                                      协作模式下对方每次保存不再引发本机整页重绘，这是“开协作就卡”的主因之一 */
    try { same = JSON.stringify(before) === JSON.stringify(c); } catch (e5) { /* noop */ }
    if (same) return;
    try { LMApp.applyRemoteContent(c); } catch (e) { return; }
    try { pushFeedFrom(before, c, by); } catch (eF0) { /* noop */ }
    setTimeout(function () { repaintLocks(); enforceBans(); }, 60);
    LMApp.toast('🔄 已同步「' + (by || '其他设备') + '」的修改');
  }
  function applyRemote(msg) {
    const c = msg.content;
    if (!validContent(c)) return;
    if (+(msg.ts || 0) <= lastTs) return; /* 过期包忽略（后写优先） */
    if (localBusy()) { pending = { content: c, ts: msg.ts, by: msg.name }; return; }
    if (verifyBanList(c)) doApply(c, msg.ts, msg.name); /* 管理员设备会核对屏蔽名单签名，坏条目剔除后再用 */
  }
  function flushPending() {
    if (!pending || localBusy()) return;
    const p = pending; pending = null;
    if (verifyBanList(p.content)) doApply(p.content, p.ts, p.by);
  }
  function recv(msg) {
    if (!msg || msg.t !== 'lm1' || !window.LMApp) return;
    if (msg.from === me.id) return; /* 服务器会把消息回发给发送者自己，过滤 */
    try { rosterTouch(msg.from, msg.name, msg.fp, msg.page); } catch (eR) { /* 脏数据不拖垮消息处理 */ }
    try {
      switch (msg.type) {
      case 'hello':
        if (!peers[msg.from]) { LMApp.toast('🟢 「' + (msg.name || '设备') + '」已上线'); }
        peers[msg.from] = { name: msg.name, fp: msg.fp, ts: msg.ts, page: msg.page };
        if (msg.want) { /* 新设备要全量：只让「设备号最小」的那台回，避免多台同时灌 */
          const ids = Object.keys(peers).concat([me.id]).sort();
          if (ids[0] === me.id && validContent(LMApp.state.content)) send({ type: 'state', to: msg.from, content: LMApp.state.content });
        }
        paintChip(); renderPanel(); break;
      case 'iam':
        if (!peers[msg.from]) { LMApp.toast('🟢 「' + (msg.name || '设备') + '」已上线'); }
        peers[msg.from] = { name: msg.name, fp: msg.fp, ts: msg.ts, page: msg.page }; paintChip(); renderPanel(); break;
      case 'state':
        if (msg.to && msg.to !== me.id) break;
        applyRemote(msg); break;
      case 'commit':
        applyRemote(msg); break;
      case 'dcommit':
        dcMerge(msg.posts, msg.name); break;
      case 'lock': {
        const lk = locks[msg.key];
        if (myLock && myLock.key === msg.key && lk && lk.by === me.id) {
          /* 我正持有这块的锁，对方确认了「共同编辑」加入进来 → 标记共享并提醒我 */
          lk.shared = true; lk.coName = msg.name; lk.ts = msg.ts || Date.now();
          LMApp.toast('「' + (msg.name || '其他人') + '」与你共同编辑这一块（改动按后写优先合并，请留意相互覆盖）');
        } else {
          locks[msg.key] = { by: msg.from, name: msg.name, ts: msg.ts, shared: !!msg.shared };
        }
        repaintLocks(); break;
      }
      case 'unlock': {
        const lk2 = locks[msg.key];
        delete coEdit[msg.key];
        if (lk2 && lk2.by === msg.from) delete locks[msg.key]; /* 只有持有者本人能解自己的锁（共同编辑不受影响） */
        else if (lk2 && lk2.shared) lk2.shared = false;
        repaintLocks(); break;
      }
      case 'bye': {
        const goneName = (peers[msg.from] && peers[msg.from].name) || msg.name || '设备';
        delete peers[msg.from]; paintChip(); renderPanel();
        if (msg.from) LMApp.toast('🔴 「' + goneName + '」已断线');
        break;
      }
      }
    } catch (eS) { /* 单条坏消息/单次处理异常不影响后续协作消息 */ }
  }
  /* ---------- 讨论区跨设备同步（v4）----------
     发送端只广播增量（新帖 / 新回复 / 删除墓碑），接收端按 id 并集合并，绝不整包覆盖正文。
     带Token 的管理员设备收到后会顺手把新讨论推上 GitHub 云端 → 其他设备轮询可见 */
  function dcMerge(posts, by) {
    if (!window.LMCommunity || !window.LMApp || !Array.isArray(posts) || !posts.length) return;
    posts = posts.slice(0, 50);
    if (localBusy()) { setTimeout(function () { dcMerge(posts, by); }, 1600); return; } /* 正在输入 → 稍后再合，不打断 */
    const cur = Array.isArray(LMApp.state.content.discuss) ? LMApp.state.content.discuss : [];
    const sig = function (l) { return l.length + '|' + l.map(function (m) { return (m && m.id) + ':' + ((m && m.del) || 0); }).join(','); };
    const before = sig(cur);
    const merged = window.LMCommunity.merge(cur, posts);
    if (sig(merged) === before) return; /* 没有新东西（重复帧/自己延迟重放） */
    LMApp.state.content.discuss = merged;
    try { window.LMCommunity.dcStore(merged); } catch (e) { /* noop */ }
    try { window.LMStore.saveLocal(LMApp.state.content); } catch (e2) { /* noop */ }
    if (typeof LMApp.refreshDiscuss === 'function') { try { LMApp.refreshDiscuss(); } catch (e3) { /* noop */ } }
    LMApp.toast('💬 讨论区同步了「' + (by || '其他设备') + '」的新发言');
    if (GH.cfg && GH.token) { /* 云端跟进（服务器/本机通道已实时送达，这里只补云端） */
      try {
        const cfg2 = LMApp.state.content.config = LMApp.state.content.config || {};
        const cb2 = cfg2.collab = cfg2.collab || {};
        cb2.syncTs = Date.now(); bump(cb2.syncTs);
        ghPush(LMApp.state.content);
      } catch (e4) { /* noop */ }
    }
  }
  function dcSend(posts) { if (Array.isArray(posts) && posts.length) send({ type: 'dcommit', posts: posts }); }
  /* ---------- 编辑占位锁 v2：硬互斥 + 共同编辑协商 ----------
     - 谁先点进某块，谁的锁生效（心跳 4s 续期，12s 无心跳自动过期，掉线不会死锁）；
     - 其他人点进被锁的块 → 焦点立即退出（无法输入），并弹出确认框：
       「某某人正在编辑」→ 取消 / 仍要共同编辑；确认后双方都可编辑（后写优先兜底），
       双方都会看到「✍ 共同编辑中」角标和提示，谁也不会被悄悄覆盖；
     - 浏览、选中、滚动不受任何影响；自己持有锁的块自己永远可以编辑 ---------- */
  var coEdit = {}; /* 我已确认「共同编辑」的锁 key（页面id:块号）——确认过就不再弹窗 */
  function lockInfoFor(idx) { /* 查某块当前有没有「别人的、未过期的」锁；返回 {name, shared} 或 null */
    if (!window.LMApp || isNaN(idx)) return null;
    const key = LMApp.state.pageId + ':' + idx;
    const lk = locks[key];
    if (!lk || lk.by === me.id) return null;
    if (Date.now() - lk.ts > LOCK_TTL) { delete locks[key]; delete coEdit[key]; repaintLocks(); return null; }
    return { name: lk.name, shared: !!lk.shared };
  }
  function takeLock(el) {
    const bw = el.closest('.block-wrap[data-idx],.free-box[data-idx]');
    if (!bw) return;
    const idx = +bw.getAttribute('data-idx');
    const key = LMApp.state.pageId + ':' + idx;
    if (lockInfoFor(idx) && !coEdit[key]) return; /* 别人正在编辑且我未确认共同编辑 → 不抢锁 */
    releaseLock();
    locks[key] = { by: me.id, name: me.name, ts: Date.now(), shared: !!coEdit[key] };
    myLock = { key: key, beat: setInterval(function () { if (myLock) send({ type: 'lock', key: myLock.key, page: LMApp.state.pageId, shared: !!coEdit[key] }); }, LOCK_BEAT) };
    send({ type: 'lock', key: key, page: LMApp.state.pageId, shared: !!coEdit[key] });
    repaintLocks();
  }
  function coEditAsk(idx, onOk) { /* 弹「某某人正在编辑」确认框；确认后执行 onOk（继续聚焦/继续套用样式） */
    try {
      const key = (window.LMApp ? LMApp.state.pageId : '') + ':' + idx;
      const lk = lockInfoFor(idx);
      if (!lk || coEdit[key]) { if (onOk) onOk(); return; }
      if (!window.LMEditor || !LMEditor.confirmModal) return;
      LMEditor.confirmModal('有人正在编辑这一块',
        '「' + escHtml(lk.name || '其他设备') + '」正在编辑这块内容，为避免互相覆盖，建议等 TA 改完再动。'
        + '如果你们约好要一起改，也可以选择同时编辑（双方都会看到共同编辑提示，改动按「后写优先」合并）。',
        '仍要共同编辑',
        function () { coEdit[key] = true; if (onOk) onOk(); });
    } catch (e) { /* 任何异常都不能挡住正常编辑 */ }
  }
  function releaseLock() {
    if (!myLock) return;
    clearInterval(myLock.beat);
    send({ type: 'unlock', key: myLock.key });
    myLock = null;
  }
  function repaintLocks() {
    document.querySelectorAll('.collab-tag').forEach(function (n) { n.remove(); });
    if (!window.LMApp) return;
    Object.keys(locks).forEach(function (key) {
      const lk = locks[key];
      if (lk.by === me.id && !lk.shared) return;
      if (Date.now() - lk.ts > LOCK_TTL) { delete locks[key]; return; }
      const parts = key.split(':');
      if (parts[0] !== LMApp.state.pageId) return;
      const bw = document.querySelector('.block-wrap[data-idx="' + parts[1] + '"],.free-box[data-idx="' + parts[1] + '"]');
      if (!bw) return;
      const tag = document.createElement('div');
      tag.className = 'collab-tag';
      if (lk.by === me.id && lk.shared) tag.textContent = '✍ 共同编辑中（我 与 ' + (lk.coName || '其他人') + '）';
      else if (lk.shared) tag.textContent = '✍ ' + (lk.name || '其他人') + ' 与其他人共同编辑中';
      else tag.textContent = '✍ ' + (lk.name || '其他人') + ' 正在编辑';
      bw.appendChild(tag);
    });
  }
  /* ---------- 在线徽章 + 设备面板 ---------- */
  function onlineList() {
    const out = [{ id: me.id, name: me.name, fp: me.fp, page: (window.LMApp ? LMApp.state.pageId : ''), self: true }];
    Object.keys(peers).forEach(function (k) { out.push(Object.assign({ id: k, self: false }, peers[k])); });
    return out;
  }
  /* ---------- Yjs 层取数（ycollab.js 未启用时安全返回空值，不影响旧通道） ---------- */
  function yPeerCount() {
    try { return (window.LMYCollab && window.LMYCollab.peerCount) ? (+window.LMYCollab.peerCount() || 0) : 0; } catch (e) { return 0; }
  }
  function yChannelLabel() {
    try {
      if (window.LMYCollab && window.LMYCollab.yjs && window.LMYCollab.channel) {
        const lb = window.LMYCollab.channel() || '';
        return lb ? ' · ' + lb : '';
      }
    } catch (e) { /* noop */ }
    return '';
  }
  function paintChip() {
    let chip = document.getElementById(CHIP_ID);
    if (!transports.length) { if (chip) chip.remove(); return; }
    if (!chip) {
      chip = document.createElement('div'); chip.id = CHIP_ID; document.body.appendChild(chip);
      chip.addEventListener('click', function () {
        const pan = document.getElementById(PANEL_ID);
        if (pan && pan.classList.contains('show')) { pan.classList.remove('show'); return; }
        renderPanel();
      });
    }
    const n = Math.max(1 + Object.keys(peers).length, yPeerCount());
    chip.innerHTML = '<span class="dot"></span>协作中 · ' + n + ' 台设备（' + modeLabel + yChannelLabel() + '）';
    chip.title = '我：' + me.name + '（#' + shortId(me.id) + '）— 点开看在线设备';
  }
  function renderPanel() {
    let pan = document.getElementById(PANEL_ID);
    if (!pan) {
      pan = document.createElement('div'); pan.id = PANEL_ID;
      document.body.appendChild(pan);
      pan.addEventListener('click', function (e) { if (e.target === pan) pan.classList.remove('show'); });
    }
    const admin = !!(window.LMApp && LMApp.state.admin);
    /* 实时在线 + 花名册里 3 分钟内活跃的设备（跨网络/跨通道也能互相看到） */
    const list = onlineList().slice();
    const seen = {};
    list.forEach(function (p) { seen[p.id] = 1; });
    const now = Date.now();
    try {
      const r = roster();
      Object.keys(r).forEach(function (k) {
        if (seen[k]) return;
        const o = r[k];
        if (now - (+o.lastSeen || 0) < 180000) list.push({ id: k, name: o.name, fp: o.fp, page: o.page || '', self: false, recent: true });
      });
    } catch (e) { /* noop */ }
    /* Yjs Awareness 在线名单并进来（网状直连的设备，可能与旧通道名单互补） */
    try {
      const yj = window.LMYCollab;
      if (yj && yj.presence) yj.presence().forEach(function (p3) {
        if (!p3 || seen[p3.id]) return;
        seen[p3.id] = 1;
        list.push({ id: p3.id, name: p3.name, fp: '', page: p3.page || '', self: !!p3.self, editing: (p3.editing == null ? null : p3.editing) });
      });
    } catch (eY2) { /* noop */ }
    const live = list.filter(function (p) { return !p.recent; }).length;
    let html = '<div class="cp-t">在线设备 ' + live + ' 台' + (live < list.length ? '（另 ' + (list.length - live) + ' 台最近活跃）' : '') + '</div>';
    html += list.map(function (p) {
      return '<div class="cp-row"><b>' + escHtml(p.name || '设备') + (p.self ? '（本机）' : '') + (p.recent ? '<span class="cp-recent">最近活跃</span>' : '') + (p.editing != null ? '<span class="cp-edit">✍ 编辑中</span>' : '') + '</b>'
        + '<span class="cp-id">#' + escHtml(shortId(p.id)) + '</span>'
        + '<span class="cp-pg">' + escHtml(p.page || '') + '</span></div>';
    }).join('');
    if (feed.length) { /* 改动动态（WPS 式）：远端合并进来的页面级变化流水 */
      html += '<div class="cp-t">最近动态</div>' + feed.map(function (f2) {
        return '<div class="cp-row"><b>' + escHtml(f2.by) + '</b>'
          + '<span class="cp-pg">' + escHtml(f2.page) + '</span>'
          + '<span class="cp-id">' + new Date(f2.ts).toLocaleTimeString('zh-CN') + '</span></div>';
      }).join('');
    }
    html += admin
      ? '<div class="cp-note">改名 / 查看全部设备 / 屏蔽管理：右上角 ⚙ 设置 → 协作与设备</div>'
      : '<div class="cp-note">设备昵称由管理员在 ⚙ 设置里统一管理（同昵称多设备允许，靠设备号区分）</div>';
    pan.innerHTML = html;
    pan.classList.add('show');
  }
  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function sweep() {
    try {
      const now = Date.now();
      Object.keys(locks).forEach(function (k) {
        if (now - locks[k].ts > LOCK_TTL) { delete locks[k]; delete coEdit[k]; repaintLocks(); }
      });
      const gonePeers = [];
      Object.keys(peers).forEach(function (k) {
        if (now - peers[k].ts > PEER_TTL) { gonePeers.push(peers[k].name || '设备'); delete peers[k]; }
      });
      if (gonePeers.length) { /* 断线提醒（掉线 25 秒无心跳 / 异常关闭未发 bye 的兜底），多台合并一条不轰炸 */
        LMApp.toast('🔴 ' + gonePeers.map(function (n2) { return '「' + n2 + '」'; }).join('') + (gonePeers.length > 1 ? ' 等 ' + gonePeers.length + ' 台设备' : '') + ' 已断线');
        paintChip(); renderPanel();
      }
      send({ type: 'iam', page: (window.LMApp ? LMApp.state.pageId : '') });
      notifyPagePeers(); /* 同页多人提醒（进页/名单变化后按 key 去重，同人只提示一次） */
    } catch (e) { /* 心跳循环永不中断 */ }
  }
  /* ---------- 屏蔽机制（名单随内容同步，签名 = 管理密码通道哈希派生） ---------- */
  function banSecret() { try { return sessionStorage.getItem('lm_ban_key') || ''; } catch (e) { return ''; } }
  function banList(c) {
    try {
      const cb = ((c || (window.LMApp ? LMApp.state.content : {})).config || {}).collab || {};
      return Array.isArray(cb.bans) ? cb.bans : [];
    } catch (e) { return []; }
  }
  function entryHit(entry, dev) { /* 设备号或指纹命中即算 */
    return (entry.id && dev.id && entry.id === dev.id) || (entry.fp && dev.fp && entry.fp === dev.fp);
  }
  function banStateFor(dev) {
    dev = dev || me;
    let site = false, admin = false, manual = false, auto = false, by = '';
    const now = Date.now();
    banList().forEach(function (en) {
      if (!en || !entryHit(en, dev)) return;
      if (en.auto && en.until && en.until < now) return; /* 自动限时条目过期后自动失效（防把人永久锁死） */
      if (en.scope === 'site') { site = true; if (!en.auto) { manual = true; by = en.name || en.by || ''; } }
      if (en.scope === 'admin') { admin = true; if (!en.auto) { manual = true; by = en.name || en.by || ''; } else auto = true; }
    });
    return { site: site, admin: admin, manual: manual, auto: auto, by: by };
  }
  function signPayload(entry, s) {
    return window.LMStore.sha256Hex(s + '|lm-ban-v1|' + [entry.id || '', entry.fp || '', entry.scope || '', entry.ts || 0].join('|'));
  }
  function verifyBanList(c) {
    /* 结构校验（收到即用）；精确的签名核对由 enforceBans 异步补验——
       没有密钥的设备没有判别能力，等管理员设备同步修正后的版本 */
    const s = banSecret();
    if (!s || !window.LMStore) return true;
    let cb = null;
    try { cb = ((c || {}).config || {}).collab; } catch (e) { return true; }
    if (!cb || !Array.isArray(cb.bans)) return true;
    const bad = cb.bans.filter(function (en) { return !en || (en.scope !== 'site' && en.scope !== 'admin') || (!en.id && !en.fp); }).length;
    if (bad) setTimeout(function () { LMApp.toast('⚠ 收到 ' + bad + ' 条不合法的屏蔽记录，将被清理'); }, 200);
    return true;
  }
  function enforceBans() {
    /* 网页级屏蔽 → 遮罩整个站点；管理员级屏蔽 → 自动退出管理模式。
       有签名密钥时异步补验每条记录：坏的剔除并重新广播（防伪造屏蔽 / 防私自解屏蔽） */
    const s = banSecret();
    const bans = banList();
    const st = banStateFor();
    let mask = document.getElementById(MASK_ID);
    if (st.site) {
      if (!mask) {
        /* 伪装成浏览器「无法访问此页面」错误页：不出现屏蔽/管理员/设备号等字样，
           被限制访问的人只会以为网页本身出了问题 */
        mask = document.createElement('div'); mask.id = MASK_ID;
        mask.innerHTML = '<div class="bm-card"><div class="bm-ico">:(</div>'
          + '<h2>无法访问此页面</h2>'
          + '<p class="bm-txt">该网页可能已发生错误，或已永久移动到新的网址。</p>'
          + '<p class="bm-err">ERR_PAGE_NOT_AVAILABLE</p>'
          + '<button type="button" class="bm-btn" onclick="location.reload()">重新加载</button></div>';
        document.body.appendChild(mask);
      }
      return;
    }
    if (mask) mask.remove();
    if (st.admin && window.LMApp && LMApp.state.admin) {
      LMApp.state.admin = false; LMApp.state.root = false;
      try { sessionStorage.removeItem('lm_admin'); sessionStorage.removeItem('lm_root'); } catch (e) { /* noop */ }
      LMApp.render();
      LMApp.toast('管理模式当前不可用');
      return;
    }
    if (!s || !window.LMStore || !bans.length) return;
    let dirty = 0, left = bans.length;
    if (!left) return;
    bans.forEach(function (en) {
      if (!en || !en.sig) { dirty++; left--; return; }
      signPayload(en, s).then(function (sig) {
        if (sig !== en.sig) { en._bad = true; dirty++; }
        if (--left <= 0 && dirty && window.LMApp) {
          const cb = ((LMApp.state.content || {}).config || {}).collab;
          if (cb && Array.isArray(cb.bans)) {
            const n0 = cb.bans.length;
            cb.bans = cb.bans.filter(function (e2) { return e2 && !e2._bad && e2.sig; });
            if (cb.bans.length !== n0) {
              try {
                cb.syncTs = Date.now(); bump(cb.syncTs);
                LMStore.saveLocal(LMApp.state.content);
              } catch (e3) { /* noop */ }
              send({ type: 'commit', content: LMApp.state.content });
              LMApp.toast('🛡 已清理 ' + (n0 - cb.bans.length) + ' 条被篡改的屏蔽记录并重新广播');
            }
          }
        }
      }).catch(function () { /* noop */ });
    });
  }
  function banDevice(devId, devFp, scope, devName) {
    if (!window.LMApp || !LMApp.state.admin) { LMApp.toast('只有管理员可以屏蔽设备'); return; }
    const s = banSecret();
    if (!s) { LMApp.toast('没有屏蔽权限：请联系站点负责人'); return; }
    if (devId === me.id || devFp === me.fp) { LMApp.toast('不能屏蔽本机'); return; }
    const entry = { id: devId || '', fp: devFp || '', scope: scope === 'admin' ? 'admin' : 'site', name: devName || '', by: me.name, ts: Date.now() };
    signPayload(entry, s).then(function (sig) {
      entry.sig = sig;
      const cfg = LMApp.state.content.config = LMApp.state.content.config || {};
      const cb = cfg.collab = cfg.collab || {};
      cb.bans = Array.isArray(cb.bans) ? cb.bans : [];
      cb.bans = cb.bans.filter(function (e2) { return !(entryHit(e2, { id: devId, fp: devFp }) && e2.scope === entry.scope); });
      cb.bans.push(entry);
      LMApp.commit({ msg: '已' + (entry.scope === 'admin' ? '限制' : '屏蔽') + '设备「' + (devName || shortId(devId)) + '」的' + (entry.scope === 'admin' ? '管理员入口' : '网页访问') });
    }).catch(function () { LMApp.toast('签名失败：请用 http(s) 打开本站后重试'); });
  }
  function unbanDevice(devId, devFp, scope) {
    if (!window.LMApp || !LMApp.state.admin) { LMApp.toast('只有管理员可以解除屏蔽'); return; }
    const s = banSecret();
    if (!s) { LMApp.toast('没有屏蔽权限：请联系站点负责人'); return; }
    const cfg = LMApp.state.content.config = LMApp.state.content.config || {};
    const cb = cfg.collab = cfg.collab || {};
    cb.bans = (Array.isArray(cb.bans) ? cb.bans : []).filter(function (e2) { return !(entryHit(e2, { id: devId, fp: devFp }) && e2.scope === scope); });
    LMApp.commit({ msg: '已解除屏蔽（' + (scope === 'admin' ? '管理员入口' : '网页访问') + '）' });
    setTimeout(enforceBans, 100);
  }
  /* ---------- 密码试错自动限时限制（banSelf） ----------
     与手动 banDevice 的三点不同：① 允许对本机生效（绕过「不能屏蔽本机」守卫——
     手动通道仍禁止屏蔽本机，防止误操作把自己踢出）；② 签名密钥在登录回调里是异步写入的，
     这里轮询等待最多 3 秒；③ 条目带 auto:1 + until 过期时间（默认 30 分钟自动失效），
     且根管理员登录成功时会被自动清除（clearAutoBan）——保证 root 永远不会被锁死在门外 */
  function banSelf(ms) {
    if (!window.LMApp || !LMApp.state.admin || !window.LMStore) return Promise.resolve(false);
    return waitBanKey(30).then(function (s) {
      if (!s) return false;
      const entry = { id: me.id, fp: me.fp, scope: 'admin', name: me.name, by: me.name, ts: Date.now(), auto: 1, until: Date.now() + (ms || 1800000), why: '多次密码错误自动限制' };
      return signPayload(entry, s).then(function (sig) {
        entry.sig = sig;
        const cfg = LMApp.state.content.config = LMApp.state.content.config || {};
        const cb = cfg.collab = cfg.collab || {};
        cb.bans = Array.isArray(cb.bans) ? cb.bans : [];
        cb.bans = cb.bans.filter(function (e2) { return !(entryHit(e2, { id: me.id, fp: me.fp }) && e2.scope === 'admin'); });
        cb.bans.push(entry);
        LMApp.commit({ msg: '本设备因 1 小时内多次密码错误，被自动限时限制管理员入口 30 分钟（根管理员可提前解禁）' });
        return true;
      });
    }).catch(function () { return false; });
  }
  function waitBanKey(tries) { /* 登录回调里密钥是异步写入 sessionStorage 的，轮询等它就绪 */
    const s = banSecret();
    if (s) return Promise.resolve(s);
    if (tries <= 0) return Promise.resolve('');
    return new Promise(function (res) { setTimeout(function () { res(waitBanKey(tries - 1)); }, 100); });
  }
  function clearAutoBan() { /* root 登录成功：清掉本机的自动限时条目（手动屏蔽不受影响） */
    const cfg = LMApp.state.content && LMApp.state.content.config;
    const cb = cfg && cfg.collab;
    if (!cb || !Array.isArray(cb.bans)) return 0;
    const before = cb.bans.length;
    cb.bans = cb.bans.filter(function (e2) { return !(e2 && e2.auto && entryHit(e2, { id: me.id, fp: me.fp })); });
    if (cb.bans.length !== before) LMApp.commit({ msg: '根管理员登录成功，已自动解除本设备的限时限制' });
    return before - cb.bans.length;
  }
  /* ---------- 对外：本地保存后广播（app.js commit 调用） ---------- */
  function publish(content) {
    if (!validContent(content)) return;
    const ts = Date.now();
    /* 版本戳随内容走：本机保存即把 syncTs 写进内容再 bump，保证 lastTs 恒等于
       「已应用内容的版本戳」。否则本机时钟恒大于云端历史版本戳，
       云端（其他设备保存的）更新会被当「过期包」永久丢弃（实测全站白屏后内容卡死的主因） */
    try {
      const cfgC = (content.config = content.config || {});
      cfgC.collab = cfgC.collab || {};
      cfgC.collab.syncTs = ts;
    } catch (eT) { /* noop */ }
    bump(ts);
    /* 云端发布把时间戳写进内容（仓库文件里可比新旧）；本地落盘但不重绘 */
    try {
      const cfg = content.config = content.config || {};
      cfg.collab = cfg.collab || {};
      cfg.collab.syncTs = ts;
      rosterSync(content); /* 设备名单随内容一起广播/上云（双向可见） */
      /* 本地落盘节流 2 秒（commit 已即时保存过一次，这里是兜底副本——高频保存时不再每次全量 stringify 写盘） */
      const now2 = Date.now();
      if (now2 - (GH._lastSave || 0) > 2000) { GH._lastSave = now2; try { if (window.LMStore) LMStore.saveLocal(content); } catch (e7) { /* noop */ } }
      else {
        clearTimeout(GH._saveT);
        GH._saveT = setTimeout(function () { try { if (window.LMApp && window.LMStore) LMStore.saveLocal(LMApp.state.content); } catch (e9) { /* noop */ } }, 2100);
      }
    } catch (e) { /* noop */ }
    send({ type: 'commit', content: content, ts: ts });
    /* ★ Yjs 网状协同：本地保存同步写入 Y.Doc（CRDT 合并），与 GitHub 回传完全解耦、互不阻塞 */
    if (window.LMYCollab && window.LMYCollab.pushLocal) { try { window.LMYCollab.pushLocal(content); } catch (eY) { /* noop */ } }
  }
  /* ---------- 云端（GitHub 仓库直存）----------
     管理员设备（有 Token）：保存 → 防抖提交 data/content.js（与「☁ 同步」同一 API）；
       轮询 GET contents API（无 CDN 缓存，能及时发现别人的提交），sha 乐观锁，409 自动重拉
     访客设备（无 Token，GitHub Pages 上）：从网址推导 owner/repo → fetch raw 文件（≤5 分钟级） */
  const GH = { cfg: null, token: '', sha: null, etag: '', lastPush: 0, timer: 0, inFlight: false, lastPullTs: 0 };
  function ghApi() {
    const path = (GH.cfg.path || 'data/content.js').replace(/^\/+/, '');
    return 'https://api.github.com/repos/' + encodeURIComponent(GH.cfg.owner) + '/'
      + encodeURIComponent(GH.cfg.repo) + '/contents/' + path.split('/').map(encodeURIComponent).join('/');
  }
  function ghRaw() {
    const path = (GH.cfg.path || 'data/content.js').replace(/^\/+/, '');
    return 'https://raw.githubusercontent.com/' + GH.cfg.owner + '/' + GH.cfg.repo + '/'
      + encodeURIComponent(GH.cfg.branch || 'main') + '/' + path.split('/').map(encodeURIComponent).join('/') + '?t=' + Date.now();
  }
  function parseFileText(txt) {
    const a = txt.indexOf('/*CONTENT-START*/'), b = txt.lastIndexOf('/*CONTENT-END*/');
    if (a < 0 || b <= a) return null;
    const seg = txt.slice(txt.indexOf('{', a), txt.lastIndexOf('}', b) + 1);
    try { return JSON.parse(seg); } catch (e) { return null; }
  }
  function atobUh(b64) {
    const bin = atob(String(b64 || '').replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function ghPull() {
    if (!GH.cfg || GH.inFlight) return;
    GH.inFlight = true;
    const useApi = !!GH.token;
    const url = useApi ? (ghApi() + '?ref=' + encodeURIComponent(GH.cfg.branch || 'main')) : ghRaw();
    const opt = useApi ? { headers: { 'Authorization': 'Bearer ' + GH.token, 'Accept': 'application/vnd.github+json' } } : {};
    if (useApi && GH.etag) opt.headers['If-None-Match'] = GH.etag; /* 条件请求：没更新时返回 304，且不消耗 API 限额 */
    fetch(url, opt).then(function (r) {
      if (r.status === 304) return null;             /* 云端没变化 */
      if (!r.ok) throw new Error('http ' + r.status);
      if (useApi) { const et = r.headers.get('etag'); if (et) GH.etag = et; }
      return r.json().then(function (j) {
        if (useApi) { GH.sha = j.sha; return parseFileText(atobUh(j.content)); }
        return parseFileText(j);
      });
    }).then(function (c) {
      GH.inFlight = false;
      if (!validContent(c)) return;
      const ts = +(((c.config || {}).collab || {}).syncTs || 0) || 1;
      const stale = (ts <= lastTs || ts <= GH.lastPullTs);
      if (!stale) {
        GH.lastPullTs = ts;
        applyRemote({ content: c, ts: ts, name: '云端（GitHub）' });
        return;
      }
      /* 时间戳不占优 ≠ 内容相同：多端并发或时钟错位时，云端可能带着本机没有的修改。
         无 Token 的访客只读不写 → 云端恒为权威：内容与本地不同就采用（防本地旧缓存永久卡死）；
         管理员（可写）保持「后写赢」，避免云端旧版盖掉本机尚未推送的新编辑。 */
      if (GH.token) return;
      try { if (JSON.stringify(c) === JSON.stringify(LMApp.state.content)) return; } catch (eC) { return; }
      if (localBusy() || !verifyBanList(c)) return;
      try {
        LMApp.applyRemoteContent(mergeBlocks(c));
        if (window.LMStore) LMStore.saveLocal(LMApp.state.content);
      } catch (eD) { return; }
      setTimeout(function () { repaintLocks(); enforceBans(); }, 60);
      LMApp.toast('🔄 已同步「云端（GitHub）」的修改');
    }).catch(function () { GH.inFlight = false; });
  }
  function ghPush(content) {
    if (!GH.cfg || !GH.token || !window.LMStore) return;
    /* 防旧覆盖新守卫：最近一次轮询看到的云端版本比本机内容新（其他设备刚推过）→
       本机不推送（避免旧内容盖掉别人的新内容），改为立即拉取应用 */
    const myTs = +(((content.config || {}).collab || {}).syncTs || 0);
    if (GH.lastPullTs > myTs) { ghPull(); return; }
    const now = Date.now();
    if (GH.inFlight) return;
    const wait = GH_PUSH_MIN - (now - GH.lastPush);
    if (wait > 0) { /* 防抖：连续保存只在安静 6 秒后补推最新版（尾随触发，不会漏推） */
      if (!GH._defer) GH._defer = setTimeout(function () {
        GH._defer = null;
        if (window.LMApp && validContent(LMApp.state.content)) ghPush(LMApp.state.content);
      }, wait + 80);
      return;
    }
    if (GH._defer) { clearTimeout(GH._defer); GH._defer = null; }
    GH.lastPush = now;
    GH.inFlight = true;
    const text = LMStore.buildFileText(content);
    const b64 = LMStore.utf8ToBase64 ? LMStore.utf8ToBase64(text) : btoa(unescape(encodeURIComponent(text)));
    const put = function (sha) {
      const body = { message: '协作同步（' + me.name + '）' + new Date().toLocaleString('zh-CN'), content: b64, branch: GH.cfg.branch || 'main' };
      if (sha) body.sha = sha;
      return fetch(ghApi(), {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + GH.token, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    };
    const getSha = GH.sha ? Promise.resolve(GH.sha)
      : fetch(ghApi() + '?ref=' + encodeURIComponent(GH.cfg.branch || 'main'), { headers: { 'Authorization': 'Bearer ' + GH.token, 'Accept': 'application/vnd.github+json' } })
        .then(function (r) { return r.ok ? r.json().then(function (j) { return j.sha; }) : null; });
    getSha.then(put).then(function (r) {
      GH.inFlight = false;
      if (r.status === 409 || r.status === 422) { /* 别人先提交 → 拉最新；6 秒后尾随重推一次（防 409 后最后一笔只留本机） */
        GH.sha = null; ghPull();
        if (!GH._409T) GH._409T = setTimeout(function () {
          GH._409T = null;
          if (window.LMApp && validContent(LMApp.state.content)) ghPush(LMApp.state.content);
        }, 6000);
        return;
      }
      if (r.ok) return r.json().then(function (j) { GH.sha = j.content && j.content.sha; });
    }).catch(function () { GH.inFlight = false; });
  }
  function ghInit() {
    if (window.LM_COLLAB_SERVER) return; /* 课堂服务器在场时以它为准（局域网最快） */
    /* 可重入：管理员登录（拿到 Token）后由 refreshGh 再次调用，自动升级为上传通道 */
    try { GH.cfg = window.LMStore ? LMStore.getGhCfg() : null; } catch (e) { GH.cfg = null; }
    GH.token = (window.LMStore && LMStore.ghToken()) || '';
    if (GH.cfg && GH.cfg.owner && GH.cfg.repo && GH.token) {
      if (GH._wired !== 'admin') {
        GH._wired = 'admin';
        transports.push({ send: function (msg) { if (msg.type === 'commit' && msg.content) ghPush(msg.content); } });
        modeLabel = '本机+云端';
        setInterval(function () {
          const act = Date.now() - (window._lmLastAct || 0) < 30000;
          const gap = document.visibilityState === 'hidden' ? POLL_HIDDEN : (act ? POLL_ACTIVE : POLL_IDLE);
          if (!GH.timer || Date.now() - GH.timer >= gap) { GH.timer = Date.now(); ghPull(); }
        }, 2000);
      }
      ghPull();
      return;
    }
    /* 访客：GitHub Pages 上自动推导 owner/repo（无 Token、只读、90 秒级轮询）。
       访客极简：不再注册占位 transport —— 不显示「协作中」徽章、不参与任何实时协同，纯浏览 */
    const h = location.hostname, p = location.pathname;
    if (/\.github\.io$/.test(h) && p.split('/')[1]) {
      if (GH._wired !== 'visitor') {
        GH._wired = 'visitor';
        GH.cfg = { owner: h.split('.')[0], repo: p.split('/')[1], branch: 'main', path: 'data/content.js' };
        modeLabel = '云端只读';
        setInterval(ghPull, POLL_VISITOR);
      }
      ghPull();
    }
  }
  /* ---------- 配置漂移自愈（防旧缓存分房）----------
     智能检测：带时间戳拉取最新的 yjs-config.js，发现房间名/口令与本机运行版不一致
     （= 本机缓存了旧配置文件，会和别的设备连进不同房间互不可见）→ 提示后自动刷新一次；
     sessionStorage 记录刷新时间，2 分钟内绝不重复刷新（Pages 构建未完成时容忍旧版，防刷新循环）。 */
  var CFG_WATCH_KEY = 'lm_cfg_reload';
  function cfgWatch() {
    try {
      const last = +(sessionStorage.getItem(CFG_WATCH_KEY) || 0);
      if (Date.now() - last < 120000) return;
      fetch('js/yjs-config.js?t=' + Date.now()).then(function (r) { return r.ok ? r.text() : ''; }).then(function (txt) {
        if (!txt) return;
        const mRoom = txt.match(/room:\s*'([^']*)'/), mPw = txt.match(/password:\s*'([^']*)'/);
        const cur = window.LMYJS_CONFIG || {};
        const drift = (mRoom && mRoom[1] && mRoom[1] !== cur.room) || (mPw && mPw[1] && mPw[1] !== cur.password);
        if (!drift) return;
        sessionStorage.setItem(CFG_WATCH_KEY, String(Date.now()));
        try { LMApp.toast('检测到网站配置已更新，正在自动刷新以保持多设备互联…'); } catch (eT) { /* noop */ }
        setTimeout(function () { location.reload(); }, 1500);
      }).catch(function () { /* 离线/网络抖动：下次再查 */ });
    } catch (eW) { /* noop */ }
  }
  /* ---------- 同页多人提醒（WPS 式）：切页 / 名单变化时提示一次，防分工撞车 ----------
     只在管理员模式响（访客极简不打扰）；同一「页面+设备组合」只提示一次，不重复轰炸 */
  var pageNotified = {};
  function notifyPagePeers() {
    try {
      if (!window.LMApp || !LMApp.state.admin) return;
      const pid = LMApp.state.pageId;
      if (!pid) return;
      const names = [], seen = {};
      Object.keys(peers).forEach(function (k) {
        const p = peers[k];
        if (p && p.page === pid && !seen[k]) { seen[k] = 1; names.push(p.name || '设备'); }
      });
      const yj = window.LMYCollab;
      if (yj && yj.presence) yj.presence().forEach(function (p3) {
        if (!p3 || p3.self || seen[p3.id] || p3.page !== pid) return;
        seen[p3.id] = 1; names.push(p3.name || '设备');
      });
      const key = pid + '|' + names.slice().sort().join(',');
      if (!names.length || pageNotified[key]) return;
      pageNotified[key] = 1;
      LMApp.toast('👥 本页还有 ' + names.length + ' 人（' + names.slice(0, 3).join('、') + (names.length > 3 ? ' 等' : '') + '）——同一块后保存的会覆盖，注意分工');
    } catch (e) { /* noop */ }
  }
  /* ---------- 事件接线 ---------- */
  function hello() { send({ type: 'hello', want: 1, page: (window.LMApp ? LMApp.state.pageId : '') }); }
  var _sweepsOn = false;
  function registerAdminTransports() { /* 同浏览器互连通道：页面加载时若已是管理员直接注册；
     若加载时还是访客（先开页面后登录——最常见路径），由 app.js 登录成功回调补调本函数。
     幂等：已注册过（__bc 标记）直接跳过；非管理员态直接返回（保持访客极简零开销）。
     修复：「先开页面 → 再登录」后协同徽章/同浏览器互连/心跳定时器永不出现的时序洞 */
    if (!window.BroadcastChannel) return;
    let lmIsAdmin = false;
    try { lmIsAdmin = sessionStorage.getItem('lm_admin') === '1'; } catch (eAdm) { /* noop */ }
    if (!lmIsAdmin) return;
    let seen = false;
    transports.forEach(function (t2) { if (t2 && t2.__bc) seen = true; });
    if (seen) return;
    try {
      const bc = new BroadcastChannel('lm_collab_v1');
      bc.onmessage = function (ev) { recv(ev.data); };
      transports.push({ send: function (msg) { bc.postMessage(msg); }, __bc: 1 });
      paintChip(); hello();
      if (!_sweepsOn) { _sweepsOn = true; setInterval(sweep, 6000); setInterval(hello, 8000); }
      try { ghInit(); } catch (eG1) { /* noop */ } /* 访客期只读轮询：登录后补探一次，切到管理员频率 */
    } catch (e2) { /* noop */ }
  }
  function init() {
    if (window.LM_COLLAB_SERVER) {
      modeLabel = '服务器中转';
      try {
        const es = new EventSource('/collab/stream');
        es.onmessage = function (ev) { try { recv(JSON.parse(ev.data)); } catch (e) { /* noop */ } };
        es.onopen = function () {
          hello();
          fetch('/collab/state').then(function (r) { return r.json(); }).then(function (d) {
            if (d && validContent(d.content) && +(d.ts || 0) > lastTs) applyRemote({ content: d.content, ts: d.ts, name: '服务器最新版' });
          }).catch(function () { /* noop */ });
        };
        transports.push({ send: function (msg) { fetch('/collab/emit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg) }).catch(function () { /* noop */ }); } });
      } catch (e) { /* noop */ }
    }
    registerAdminTransports(); /* 页面加载时若已是管理员（登录过+刷新）直接注册；访客态则等待登录回调补调 */
    if (transports.length) { paintChip(); hello(); if (!_sweepsOn) { _sweepsOn = true; setInterval(sweep, 6000); setInterval(hello, 8000); } }
    setTimeout(cfgWatch, 45000); setInterval(cfgWatch, 180000); /* 配置漂移自愈：45 秒后首查 + 每 3 分钟复查 */
    ['mousedown', 'keydown', 'touchstart'].forEach(function (ev) {
      document.addEventListener(ev, function () { window._lmLastAct = Date.now(); }, { passive: true });
    });
    window.addEventListener('hashchange', function () { setTimeout(notifyPagePeers, 900); }); /* 切页后等渲染稳定再提醒 */
    document.addEventListener('mousedown', function () { pointerDown = true; }, true);
    document.addEventListener('mouseup', function () { pointerDown = false; flushPending(); }, true);
    document.addEventListener('focusin', function (e) {
      if (!window.LMApp || !LMApp.state.admin) return;
      const t = e.target;
      if (!t || !t.closest || t.closest('#editBar,#brushPop,#navGear,#gearPop,.popover,#adminBar,.modal-mask,.cfm-mask,.crop-bar,#collabPanel')) return;
      if (!(t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName))) return;
      const bw = t.closest('.block-wrap[data-idx],.free-box[data-idx]');
      if (bw) {
        const fi = +bw.getAttribute('data-idx');
        if (lockInfoFor(fi) && !coEdit[LMApp.state.pageId + ':' + fi]) {
          t.blur(); /* 别人正在编辑：立即退出焦点（无法输入），弹确认框询问是否共同编辑 */
          coEditAsk(fi, function () { try { t.focus(); } catch (e2) { /* noop */ } });
          return;
        }
      }
      takeLock(t);
    });
    document.addEventListener('focusout', function () { releaseLock(); flushPending(); });
    window.addEventListener('beforeunload', function () { releaseLock(); send({ type: 'bye' }); });
    window.addEventListener('load', function () { paintChip(); enforceBans(); });
    enforceBans();
    ghInit();
  }
  init();
  return {
    publish: publish,
    mode: function () { return modeLabel; },
    me: function () { return { id: me.id, name: me.name, fp: me.fp }; },
    setName: setName,
    shortId: shortId,
    onlineList: onlineList,
    rosterList: rosterList,
    banStateFor: banStateFor,
    banDevice: banDevice,
    unbanDevice: unbanDevice,
    banSelf: banSelf,
    clearAutoBan: clearAutoBan,
    startAsAdmin: registerAdminTransports, /* 登录成功后补启动协同通道（app.js 回调调用） */
    dcSend: dcSend,
    lockBlock: function (el) { /* 点选块：外人锁着时静默不抢锁（浏览/选中不受影响），只有真正输入才会弹协商框 */
      try {
        const bw = el && el.closest ? el.closest('.block-wrap[data-idx],.free-box[data-idx]') : null;
        if (!bw) return;
        const fi = +bw.getAttribute('data-idx');
        if (lockInfoFor(fi) && !coEdit[LMApp.state.pageId + ':' + fi]) return;
        takeLock(el);
      } catch (e) { /* noop */ }
    },
    unlockBlock: function () { try { releaseLock(); } catch (e) { /* noop */ } },
    lockInfoFor: function (idx) { try { return lockInfoFor(idx); } catch (e) { return null; } },
    coEditAsk: coEditAsk,
    enforceBans: enforceBans,
    paintChip: paintChip,
    refreshGh: ghInit, /* 普通管理员登录取回 Token 后重探云端通道（ghInit 已重入化，不会重复接线） */
    renderPanel: renderPanel,
    applyExternal: function (c, by) { /* Yjs 网状协同与旧通道共用同一个「远端应用」漏斗 */
      try { applyRemote({ content: c, ts: Date.now(), name: by || '其他设备' }); } catch (eA) { /* noop */ }
    }
  };
})();
