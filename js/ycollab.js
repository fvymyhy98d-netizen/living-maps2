/* =========================================================
   ycollab.js —— Yjs 实时协同层（Mesh P2P · 工程版）
   架构（README 三·补11）：
   ▸ 数据层：Y.Doc（CRDT）+ y-indexeddb —— 本地持久化「先于」网络同步初始化（硬性顺序）；
   ▸ 传输层：原生 WebRTC DataChannel 网状 Mesh（每台设备直连其他所有在线设备）；
     信令 = 腾讯云 CloudBase 实时推送 Broadcast（js/yjstcb.js）。原 Cloudflare workers.dev
     信令（signaling-worker/ 目录留档）因国内运营商全面 DNS 污染已弃用；TURN 自动兜底；
   ▸ 在线人数 / 谁在编辑哪一块：Yjs Awareness（无中心服务器计数）；
   ▸ 通道状态机：getStats() 判定 P2P直连(IPv6/IPv4)/TURN中继/离线，左下角徽章实时显示；
   ▸ 集成：远端更新走「同一个漏斗」LMCollab.applyExternal → 块级后写优先合并，
     讨论区/花名册/屏蔽校验/防打断逻辑全部复用；单人编辑回传 GitHub 与本层完全解耦；
   ▸ 降级：库加载失败 / 信令不可达 → 自动回退原有通道（本机互连 + 云端），失败可见不静默。
   ========================================================= */
(function () {
  'use strict';
  var CFG = window.LMYJS_CONFIG || {};
  /* 降级桩：任何失败阶段都把 LMYCollab 换成它 —— 旧通道照常工作，UI 显示「离线」 */
  function stub(msg) {
    window.LMYCollab = {
      failed: true, yjs: false,
      peerCount: function () { return 0; },
      channel: function () { return ''; },
      presence: function () { return []; },
      pushLocal: function () { /* 未启用 */ }
    };
    /* 降级必须留痕：Console 记录完整信息（含堆栈），方便远程排查「协同初始化失败」类问题 */
    try { console.warn('[LMY-collab] 已降级为离线模式：', msg || ''); } catch (eW0) { /* noop */ }
    if (msg) { try { if (window.LMApp) LMApp.toast('⚠ ' + msg); } catch (e) { /* noop */ } }
  }
  window.LMYCollab = {
    failed: true, yjs: false,
    peerCount: function () { return 0; },
    channel: function () { return ''; },
    presence: function () { return []; },
    pushLocal: function () { /* 启动中 */ }
  };
  if (CFG.enabled === false) { stub(); return; }

  /* ---------- 本地库加载（lib/ 相对路径；Yjs 三件套已随仓库发布，零 CDN 依赖） ---------- */
  var LIBS = [
    { spec: 'lib/yjs.js', ok: function () { return !!(window.Yjs && window.Yjs.Doc); } },
    { spec: 'lib/y-protocols.js', ok: function () { return !!(window.YProtocols && window.YProtocols.awareness && window.YProtocols.awareness.Awareness); } },
    { spec: 'lib/y-indexeddb.js', ok: function () { return !!pickIdb(); } }
  ];
  function loadScript(url) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; try { s.remove(); } catch (e1) { /* noop */ } rej(new Error('timeout')); } }, 9000);
      s.src = url;
      s.onload = function () { if (!done) { done = true; clearTimeout(t); res(); } };
      s.onerror = function () { if (!done) { done = true; clearTimeout(t); rej(new Error('load-fail')); } };
      document.head.appendChild(s);
    });
  }
  function loadAll() {
    var chain = Promise.resolve();
    LIBS.forEach(function (lib) {
      chain = chain.then(function () {
        if (lib.ok()) return Promise.resolve();
        return loadScript(lib.spec).then(function () {
          if (!lib.ok()) throw new Error('lib-fail:' + lib.spec);
        });
      });
    });
    return chain;
  }
  function pickIdb() {
    var gs = [window.YjsIndexeddb, window.YjsIndexedDB, window.yIndexedDB];
    for (var i = 0; i < gs.length; i++) {
      var o = gs[i]; if (!o) continue;
      if (o.IndexeddbPersistence) return o.IndexeddbPersistence;
      if (o.default && o.default.IndexeddbPersistence) return o.default.IndexeddbPersistence;
    }
    return window.IndexeddbPersistence || null;
  }

  /* ---------- 通道判定（纯函数；test_yjs.js 直接提取本函数做验证） ----------
     判定信号：getStats() 存在 succeeded 候选对（iceConnectionState connected/completed 的
     必然产物）。local 候选 host/srflx/prflx = 直连（地址含 ':' 即 IPv6）；relay = TURN 中继。
     多设备混合时「有直连就报直连」—— TURN 是兜底不是目的，直连恢复自动切回显示。 */
  function classifyChannel(pairs) {
    var sel = (pairs || []).filter(function (p) { return p && p.state === 'succeeded' && (p.selected === true || p.nominated === true); });
    if (!sel.length) sel = (pairs || []).filter(function (p) { return p && p.state === 'succeeded'; });
    if (!sel.length) return '等待连接';
    var d6 = false, d4 = false, relay = false;
    sel.forEach(function (p) {
      if (p.type === 'relay') { relay = true; return; }
      if (String(p.addr || '').indexOf(':') >= 0) d6 = true; else d4 = true;
    });
    if (d6) return 'P2P直连 · IPv6';
    if (d4) return 'P2P直连 · IPv4';
    if (relay) return 'TURN 中继';
    return '等待连接';
  }
  var COLORS = ['#0a84ff', '#34c759', '#ff9f0a', '#bf5af2', '#ff375f', '#5e5ce6', '#64d2ff'];
  function hashStr(s) { var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function me() { return (window.LMCollab && LMCollab.me()) || { id: '', name: '设备', fp: '' }; }
  function toast(m) { try { if (window.LMApp) LMApp.toast(m); } catch (e) { /* noop */ } }

  var ydoc = null, ymap = null, provider = null, myEditing = null, lastChannel = '';
  var applying = false;

  /* 本地保存 → 写入 Y.Doc（diff 后只写有变化的键；origin='lm-local' 防止回灌自己） */
  function pushLocal(content) {
    if (!ydoc || !ymap || !content || !Array.isArray(content.pages) || applying) return;
    try {
      ydoc.transact(function () {
        var meta = {};
        Object.keys(content).forEach(function (k) { if (k !== 'pages') meta[k] = content[k]; });
        var ms = JSON.stringify(meta);
        if (ymap.get('meta') !== ms) ymap.set('meta', ms);
        var seen = {};
        content.pages.forEach(function (p) {
          if (!p || !p.id) return;
          var key = 'page:' + p.id; seen[key] = 1;
          var ps = JSON.stringify(p);
          if (ymap.get(key) !== ps) ymap.set(key, ps);
        });
        ymap.keys().forEach(function (k) { if (k.indexOf('page:') === 0 && !seen[k]) ymap.delete(k); });
      }, 'lm-local');
    } catch (e) { /* noop */ }
  }
  /* 远端更新 → 走与旧通道同一个漏斗（applyExternal → 块级后写优先 + 防打断 + 讨论区合并） */
  function applyKeys(keys, by) {
    if (!window.LMApp || !window.LMCollab || !keys.length) return;
    try {
      var c = JSON.parse(JSON.stringify(LMApp.state.content));
      keys.forEach(function (k) {
        var v = ymap.get(k);
        if (k === 'meta') {
          var mm = {}; try { mm = JSON.parse(v || '{}'); } catch (e1) { return; }
          Object.keys(mm).forEach(function (k2) { c[k2] = mm[k2]; });
        } else if (k.indexOf('page:') === 0) {
          var id = k.slice(5), pj = null;
          try { pj = v ? JSON.parse(v) : null; } catch (e2) { return; }
          var at = -1;
          (c.pages || []).forEach(function (p, i) { if ((p && p.id) === id) at = i; });
          if (pj) { if (at < 0) c.pages.push(pj); else c.pages[at] = pj; }
          else if (at >= 0) c.pages.splice(at, 1);
        }
      });
      applying = true;
      LMCollab.applyExternal(c, by);
      applying = false;
      /* 合并结果（块级后写优先后）回写 Y.Doc —— 全网收敛到同一份；diff 后通常零写入 */
      pushLocal(LMApp.state.content);
    } catch (e) { applying = false; }
  }
  function allKeys() { var out = []; try { ymap.keys().forEach(function (k) { out.push(k); }); } catch (e) { /* noop */ } return out; }

  /* ---------- Awareness：在线人数 / 谁在编辑哪一块（无中心计数） ---------- */
  function paintPeers() {
    if (!window.LMApp) return;
    try {
      var tags = document.querySelectorAll('.lm-peer-tag');
      for (var i = 0; i < tags.length; i++) tags[i].remove();
      var marks = document.querySelectorAll('.block-wrap.lm-peer-edit');
      for (var j = 0; j < marks.length; j++) { marks[j].classList.remove('lm-peer-edit'); marks[j].style.removeProperty('--peer-c'); }
      var seen = {}, tagSeen = {};
      (window.LMYCollab && window.LMYCollab.presence ? window.LMYCollab.presence() : []).forEach(function (p) {
        if (!p || p.self || p.editing == null || seen[p.id] || tagSeen[p.editing]) return;
        if (p.page !== LMApp.state.pageId) return;
        var w = document.querySelector('.block-wrap[data-idx="' + p.editing + '"]');
        if (!w) return;
        seen[p.id] = 1; tagSeen[p.editing] = 1;
        w.classList.add('lm-peer-edit');
        w.style.setProperty('--peer-c', p.color || '#0a84ff');
        var tag = document.createElement('div');
        tag.className = 'lm-peer-tag';
        tag.style.setProperty('--peer-c', p.color || '#0a84ff');
        tag.textContent = '✍ ' + (p.name || '其他人') + ' 正在编辑';
        w.appendChild(tag);
      });
    } catch (e) { /* 装饰失败不影响内容 */ }
  }
  function setChannel(lab) {
    if (lab === lastChannel) return;
    lastChannel = lab;
    try { if (window.LMCollab && LMCollab.paintChip) LMCollab.paintChip(); } catch (e) { /* noop */ }
  }
  /* 通道状态机：直连优先判定 → TURN 兜底 → 离线；每 3 秒重探（直连恢复自动切回显示） */
  function probe() {
    if (!provider) return;
    var conns = [];
    try {
      if (typeof provider.getPeerPCs === 'function') conns = provider.getPeerPCs() || [];
    } catch (e) { /* noop */ }
    var nPeers = 0; try { nPeers = window.LMYCollab.peerCount(); } catch (e2) { /* noop */ }
    if (!conns.length) { setChannel(nPeers > 0 ? '等待连接' : '离线（本地可用）'); return; }
    var pend = conns.length, pairs = [];
    function check() { if (pend > 0) return; setChannel(classifyChannel(pairs)); }
    conns.forEach(function (pc) {
      var pr;
      try { pr = Promise.resolve(pc.getStats()); } catch (e3) { pend--; check(); return; }
      pr.then(function (stats) {
        try {
          var cands = {};
          stats.forEach(function (r) { if (r.type === 'local-candidate') cands[r.id] = r; });
          stats.forEach(function (r) {
            if (r.type !== 'candidate-pair' || r.state !== 'succeeded') return;
            var lc = cands[r.localCandidateId];
            if (!lc) return;
            pairs.push({ state: 'succeeded', selected: (r.selected === true || r.nominated === true), type: lc.candidateType, addr: lc.address || lc.ip || '' });
          });
        } catch (e4) { /* noop */ }
        pend--; check();
      }, function () { pend--; check(); });
    });
  }
  function boot2() {
    try {
      var TCB = window.LMYjsTCB;
      if (!TCB || !TCB.isReady()) { stub('信令库（MQTT）加载失败，已降级：本机互连 + 云端照常'); return; }
      /* ★ 网状 Mesh：信令只牵线——MQTT 只传 SDP/ICE 握手，文档数据 P2P 直连，
         直连失败自动 TURN 兜底。awareness 与 y-webrtc 同形状，以下逻辑无需感知切换 */
      provider = TCB.start({
        brokers: (CFG.mqtt && CFG.mqtt.brokers) || [],   /* EMQX/HiveMQ 公共 Broker 池（房间哈希确定性选台） */
        channel: CFG.room || 'living-maps-v1',
        password: CFG.password || '',
        iceServers: (CFG.iceServers && CFG.iceServers.length) ? CFG.iceServers : [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ],
        doc: ydoc,
        onStatus: function (kind, detail) {
          try { console.warn('[LMY-collab]', kind, detail || ''); } catch (eW) { /* noop */ } /* 诊断留痕：信令全生命周期 */
          if (kind === 'signaling-on') { setChannel('等待连接'); toast('🟢 信令已连接（EMQX 公共 MQTT）：P2P 网状协同就绪'); }
          else if (kind === 'signaling-off') { setChannel('离线（本地可用）'); toast('⚠ 信令断开：' + (detail || '') + '（改动已存本机，恢复后自动合并）'); }
          else if (kind === 'error') { setChannel('离线（本地可用）'); toast('⚠ 信令异常：' + detail); }
        }
      });
      var aw = provider.awareness;
      var myColor = COLORS[hashStr(me().id) % COLORS.length];
      function setAw() {
        var m0 = me();
        try { aw.setLocalState({ lm: { id: m0.id, name: m0.name, page: (window.LMApp ? LMApp.state.pageId : ''), editing: myEditing, color: myColor } }); } catch (e) { /* noop */ }
      }
      setAw();
      document.addEventListener('focusin', function (e) {
        if (!window.LMApp || !LMApp.state.admin) return;
        var t = e.target;
        if (!t || !t.closest || t.closest('#editBar,#brushPop,#navGear,#gearPop,.popover,#adminBar,.modal-mask,.cfm-mask,#collabPanel')) return;
        if (!(t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName))) return;
        var bw = t.closest('.block-wrap[data-idx],.free-box[data-idx]');
        myEditing = bw ? +bw.getAttribute('data-idx') : null;
        setAw(); paintPeers();
      });
      document.addEventListener('focusout', function () { if (myEditing != null) { myEditing = null; setAw(); paintPeers(); } });
      window.addEventListener('hashchange', setAw);
      aw.on('change', function () { paintPeers(); try { if (window.LMCollab && LMCollab.paintChip) LMCollab.paintChip(); } catch (e2) { /* noop */ } });
      /* 远端更新（origin 非 'lm-local'）→ 合并应用；本机写入不回灌 */
      ymap.observe(function (ev, tr) {
        if (tr && tr.origin === 'lm-local') return;
        var keys = [];
        ev.keysChanged.forEach(function (k) { keys.push(k); });
        var by = '其他设备';
        try { aw.getStates().forEach(function (st) { if (st.lm && st.lm.name) by = st.lm.name; }); } catch (e3) { /* noop */ }
        applyKeys(keys, by);
      });
      setInterval(probe, 3000); probe();
      setInterval(setAw, 15000); /* presence 心跳 */
      window.LMYCollab = {
        failed: false, yjs: true,
        peerCount: function () { try { return Math.max(0, aw.getStates().size - 1); } catch (e5) { return 0; } },
        channel: function () { return lastChannel; },
        presence: function () {
          var out = [], m0 = me();
          try { aw.getStates().forEach(function (st) { if (st.lm) out.push({ id: st.lm.id, name: st.lm.name, page: st.lm.page || '', editing: (st.lm.editing == null ? null : st.lm.editing), color: st.lm.color, self: st.lm.id === m0.id }); }); } catch (e6) { /* noop */ }
          return out;
        },
        pushLocal: pushLocal
      };
      try { if (window.LMCollab && LMCollab.paintChip) LMCollab.paintChip(); } catch (e7) { /* noop */ }
      toast('🟢 实时协同已就绪（Yjs Mesh）：自动直连 / TURN 兜底 / 离线可用');
    } catch (eBoot) {
      /* 初始化失败不再静默吞掉异常：Console 记录完整堆栈 + toast 显示具体原因，
         并允许有限次自动重试（偶发时序问题一次失败不该永久降级） */
      try { console.error('[LMY-collab] 协同网络初始化失败：', eBoot && (eBoot.stack || eBoot.message) || eBoot); } catch (eE0) { /* noop */ }
      stub('协同网络初始化失败（' + String((eBoot && eBoot.message) || eBoot).slice(0, 80) + '）——已降级：本机互连 + 云端照常');
      scheduleRetry();
    }
  }
  var booted = false, bootTries = 0;
  function scheduleRetry() { /* 失败后有限次重试（60 秒间隔）：偶发的库加载/初始化时序问题可自愈 */
    if (bootTries >= 2) return;
    bootTries++;
    booted = false;
    setTimeout(function () { try { boot(); } catch (eR0) { /* noop */ } }, 60000);
  }
  function boot() {
    if (booted) return; booted = true;
    loadAll().then(function () {
      try {
        var Y = window.Yjs;
        ydoc = new Y.Doc();
        ymap = ydoc.getMap('lm');
        var IdbP = pickIdb();
        /* ★ 硬性顺序（提示词 §0）：本地持久化先于网络同步初始化 ——
           IDB 打开/同步完成（或 3.5 秒超时保护）之后才启动 Mesh 网络 */
        var p1 = new IdbP(CFG.room || 'living-maps-v1', ydoc);
        var t0 = setTimeout(function () { boot2(); }, 3500);
        p1.whenSynced.then(function () { clearTimeout(t0); boot2(); }, function () { clearTimeout(t0); boot2(); });
        /* IDB 恢复出的内容先合并进页面（块级后写优先：本机离线期间的新块不丢），
           合并结果经 pushLocal 回写 Y.Doc，网络层一开即全网收敛 */
        setTimeout(function () {
          try { applyKeys(allKeys(), '离线恢复'); } catch (eR) { /* noop */ }
        }, 60);
      } catch (e) {
        try { console.error('[LMY-collab] 本地持久化初始化失败：', e && (e.stack || e.message) || e); } catch (eE1) { /* noop */ }
        stub('本地持久化初始化失败（' + String((e && e.message) || e).slice(0, 80) + '）——已降级：本机互连 + 云端照常');
        scheduleRetry();
      }
    }, function (eL) {
      try { console.error('[LMY-collab] 协同库加载失败：', eL && (eL.message || eL) || eL); } catch (eE2) { /* noop */ }
      stub('实时协同库（Yjs）加载失败——已降级：本机互连 + 云端照常');
      scheduleRetry();
    });
  }
  /* 访客极简：未登录管理员的设备不启动实时协同（不连信令、不显示在线模块），只保留云端只读轮询；
     管理员登录成功后由 app.js 调用 window.LMYCollabStart() 按需启动（登录前加载的仅为降级桩，不产生任何连接） */
  function maybeBoot() {
    var isAdmin = false;
    try { isAdmin = sessionStorage.getItem('lm_admin') === '1'; } catch (eGate) { /* 无痕/受限环境按访客处理 */ }
    if (isAdmin) boot();
  }
  if (document.readyState === 'complete') setTimeout(maybeBoot, 400);
  else window.addEventListener('load', function () { setTimeout(maybeBoot, 400); });
  window.LMYCollabStart = function () { setTimeout(boot, 60); };
})();
