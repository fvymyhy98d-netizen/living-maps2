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
  var GONE_TTL = 120000; /* ★ 修复73：断线后宽限 2 分钟，还没回来就当它不会再回来，从在线名单移除 */
  var GH_PUSH_MIN = 6000, POLL_ACTIVE = 2000, POLL_IDLE = 8000, POLL_HIDDEN = 60000, POLL_VISITOR = 90000;
  /* ★ 修复88：**有人在线就提速** —— 除本机外还有设备在线时：推送防抖 6s→2.6s、活动轮询 2s→1.2s、
     闲置轮询 8s→3.5s；只有自己一台时保持原节奏（省流量 / 省电 / 省 GitHub 写入）。
     访客（只读）从前台 90s 提到 25s（raw 请求带 ?t= 破缓存，拿到的就是最新版）。
     这些数值都能在控制台 LMCollab.diag() 里直接看到，方便现场核对。 */
  var HOT_PUSH_MIN = 2600, HOT_ACTIVE = 1200, HOT_IDLE = 3500, VISITOR_SHOWN = 25000;
  var me = readDevice();
  var lastTs = +(localStorage.getItem(TS_KEY) || 0);
  var peers = {};    /* 设备id -> {name, fp, ts, page} */
  var locks = {};    /* '页面id:块号' -> {by, name, ts} */
  var myLock = null;
  var pending = null;
  var pointerDown = false;
  var pointerAt = 0;   /* ★ 修复72：指针按下的时刻（0=未按下）；超过 20 秒视为松手事件丢失，自动复位 */
  var lastKeyAt = 0;   /* ★ 修复72：最后一次按键的时刻 —— localBusy 只认「真的在打字」 */
  /* ★ 修复73：设备在线状态机 —— 区分「在线 / 断线（网络中断，会自己回来）/ 已退出（关页）」。
     liveSeen: id -> {id,name,page,self,state,last,lostAt}，state = online | lost
     leftIds：收到 bye（对方关页退出）的设备号 -> 时刻，短暂屏蔽 Yjs awareness 的残留状态，
              免得刚提示「已退出页面」又被残留 presence 顶回「在线」 */
  var liveSeen = {};
  var leftIds = {};
  var peerToastAt = {};                    /* id -> 上次上下线提示时刻（8 秒去抖） */
  var presenceQuiet = Date.now() + 8000;   /* 启动静默期：两边同时打开页面不互相刷屏 */
  var presenceTicking = false;
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
    hello(); paintChip(); refreshPanel();
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
  /* ★ 修复72：未来时间戳不许写进 lastTs —— 对端时钟快几分钟，它的包一应用就把本机
     lastTs 顶到「未来」，此后按本机时间戳来的更新都 <= lastTs 被当过期包丢弃：
     症状不是「慢半拍」，而是「这一段时间内彻底不进来」 */
  function bump(ts) {
    ts = +ts || 0;
    if (ts > Date.now() + 60000) ts = Date.now();
    if (ts > lastTs) { lastTs = ts; try { localStorage.setItem(TS_KEY, String(ts)); } catch (e) { /* noop */ } }
  }
  function send(msg) {
    msg = msg || {}; msg.t = 'lm1'; msg.from = me.id; msg.name = me.name; msg.fp = me.fp; msg.ts = Date.now();
    transports.forEach(function (tr) { try { tr.send(msg); } catch (e) { /* noop */ } });
  }
  /* ★ 修复72（「对方改完，我这边一直不动」）：什么才算「本机正忙、远端包先挂起」——
     只认「真的在动手」：① 弹窗/裁剪层打开；② 指针按下（拖拽中，含 20 秒兜底）；
     ③ 最近一次按键在 1.2 秒内。
     旧逻辑把「光标停在某个可编辑框里」也算忙 —— 两台设备实测的现场正是这样：点开文本框
     看到 ✍ 标记后人就不动了，对方改完的内容全部进 pending；而 pending 只靠 mouseup /
     focusout 两个事件分流，人一停手就永远不分流 →「徽标能看到在编辑、内容迟迟不出现」。
     拖拽还要防「在窗口外松手」：mouseup 收不到时 pointerDown 会一直为真，同样永久挂起，
     所以按下时刻一并记下，超过 20 秒自动复位。 */
  var BUSY_KEY_WIN = 1200;   /* 按键后 1.2 秒内算「输入中」 */
  var BUSY_PTR_MAX = 20000;  /* 指针按下最多认 20 秒 */
  function localBusy() {
    if (!window.LMApp) return true;
    if (document.querySelector('.modal-mask,.crop-overlay')) return true;
    if (pointerDown) {
      if (Date.now() - (pointerAt || 0) > BUSY_PTR_MAX) { pointerDown = false; pointerAt = 0; }
      else return true;
    }
    if (lastKeyAt && Date.now() - lastKeyAt < BUSY_KEY_WIN) return true;
    return false;
  }
  /* ---------- 冲突保护②：字段级三向合并（修复121，取代旧的纯块级后写优先） ----------
     旧规则：逐个块比 _ts，后保存的一方**整块**覆盖 → A 改了文字、B 只改了字号，谁后保存另一个人的改动就没了。
     新规则：以「上一次双方收敛的内容」为共同祖先（noteBase 记录），按**字段**做三向合并：
       ▸ 只有一方改过该字段 → 用改过的那一方（两边都不丢）；
       ▸ 两边都改了同一字段 → 按块级 _ts 后写优先（行为可预期，不会出现「字段被劈成两半」）；
       ▸ 一方删掉该字段、另一方没动 → 尊重删除。
     页结构 / 块数不一致（插入/删除/调序）仍整包取远端，与历史版本兼容。
     ⚠ 祖先只在「真正应用成功」之后才推进（doApply 内 noteBase），
        否则被挂起（本机正在输入）的包会把祖先顶到前面，下一轮就会把自己的改动判成"本地改动"而压掉远端。 */
  var _base = null;
  function noteBase(content) {   /* 收敛后记下共同祖先（深拷贝，避免被后续编辑就地污染） */
    try { _base = content ? JSON.parse(JSON.stringify(content)) : null; } catch (eB) { _base = null; }
  }
  /* 纯函数（可单测）：base / local / remote 三份块对象 → 合并结果 */
  function mergeBlockFields(bb, lb, rb) {
    const b0 = bb || {}, l0 = lb || {}, r0 = rb || {};
    const nowT = Date.now();   /* ★ 修复122：设备时钟快的那个会把 _ts 写成「未来」，此后它的字段永远赢 */
    const out = {}, keys = {};
    [b0, l0, r0].forEach(function (o) { Object.keys(o).forEach(function (k) { keys[k] = 1; }); });
    Object.keys(keys).forEach(function (k) {
      let B, L, R;
      try { B = JSON.stringify(b0[k]); L = JSON.stringify(l0[k]); R = JSON.stringify(r0[k]); } catch (eS) { L = R = null; B = '~'; }
      let v;
      if (L === R) v = l0[k];                        /* 两边一致（含都没动）→ 用它 */
      else if (L === B) v = r0[k];                   /* 只有远端改了 → 用远端 */
      else if (R === B) v = l0[k];                   /* 只有本地改了 → 用本地 */
      else {
        /* 都改了 → 后写优先；未来时间戳按「此刻」算，避免时钟错的设备长期霸占同一字段 */
        const lt = Math.min(+l0._ts || 0, nowT), rt = Math.min(+r0._ts || 0, nowT);
        v = lt > rt ? l0[k] : r0[k];
      }
      if (v === undefined) return;                   /* 两边都没这个字段 → 不写空键 */
      out[k] = v;
    });
    out._ts = Math.min(Math.max(+l0._ts || 0, +r0._ts || 0), nowT);   /* ★ 修复122：未来戳不外溢 */
    return out;
  }
  function mergeBlocks(c) {
    try {
      const base = window.LMApp ? LMApp.state.content : null;
      if (!base || !Array.isArray(base.pages) || !Array.isArray(c.pages)) return c;
      if (base.pages.length !== c.pages.length) return c;
      for (let i = 0; i < base.pages.length; i++) {
        if ((base.pages[i] && base.pages[i].id) !== (c.pages[i] && c.pages[i].id)) return c;
      }
      const anc = _base;
      c.pages.forEach(function (rp, i) {
        const bp = base.pages[i];
        if (!bp || !rp || !Array.isArray(bp.blocks) || !Array.isArray(rp.blocks)) return;
        if (bp.blocks.length !== rp.blocks.length) return; /* 该页结构变了 → 整页取远端 */
        /* 祖先里的同一页：页 id 与块数都必须对得上，否则这次不用祖先（退回块级后写优先） */
        const pid = rp.id || bp.id;
        const ap = (anc && Array.isArray(anc.pages)) ? anc.pages.filter(function (p) { return p && p.id === pid; })[0] : null;
        const ancOk = !!(ap && Array.isArray(ap.blocks) && ap.blocks.length === rp.blocks.length);
        rp.blocks.forEach(function (rb, j) {
          const bb = bp.blocks[j];
          if (!bb || !rb) return;
          if (JSON.stringify(bb) === JSON.stringify(rb)) return;
          if (ancOk) { rp.blocks[j] = mergeBlockFields(ap.blocks[j], bb, rb); return; }  /* ★ 字段级 */
          const bt = +bb._ts || 0, rt = +rb._ts || 0;
          if (bt > rt) rp.blocks[j] = bb; /* 没有祖先：退回块级后写优先（旧规则） */
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
  /* ★ 修复88：结构冲突可见化 —— 同一页块数/顺序变了只能「整页后写优先」（块没有稳定 id，
     无法安全对齐），本机在这页的改动可能被对方版本整片覆盖。旧版是静默覆盖：用户只看到
     「我刚加的那块自己没了」。检测到就明确提示一次（15 秒去抖），至少让人知道发生了什么。
     注意：块数一致时走的是块级后写优先，各改各的块不会互相丢，这里不会误报。 */
  var _structWarnAt = 0;
  function structConflictWarn(c, by) {
    try {
      const base = window.LMApp ? LMApp.state.content : null;
      if (!base || !Array.isArray(base.pages) || !Array.isArray(c.pages)) return;
      const now = Date.now();
      if (now - _structWarnAt < 15000) return;
      let hit = false;
      base.pages.forEach(function (bp) {
        if (!bp || !Array.isArray(bp.blocks)) return;
        const rp = c.pages.filter(function (x) { return x && x.id === bp.id; })[0];
        if (!rp || !Array.isArray(rp.blocks)) return;
        if (bp.blocks.length === rp.blocks.length) return; /* 结构一致 → 块级后写优先，不会整页覆盖 */
        const maxTs = function (arr) {
          return arr.reduce(function (m, b) { return Math.max(m, +((b && b._ts) || 0)); }, 0);
        };
        if (maxTs(bp.blocks) > maxTs(rp.blocks)) hit = true; /* 本机有更新的改动，却被整页覆盖 */
      });
      if (!hit) return;
      _structWarnAt = now;
      LMApp.toast('⚠ 与「' + (by || '其他设备') + '」的结构改动冲突：本页已采用对方版本，你在这页新增/删除的块可能被覆盖');
    } catch (e) { /* 提示失败不影响同步 */ }
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
    c = mergeBlocks(c);            /* 字段级三向合并（见上方注释；无祖先时退回块级后写优先） */
    const before = LMApp.state.content;
    let same = false;              /* 内容一模一样（重复帧 / 别人保存但没改东西）→ 不重绘不提示：
                                      协作模式下对方每次保存不再引发本机整页重绘，这是“开协作就卡”的主因之一 */
    try { same = JSON.stringify(before) === JSON.stringify(c); } catch (e5) { /* noop */ }
    if (same) return;
    structConflictWarn(c, by); /* ★ 修复88：被整页覆盖前先提醒一句（见函数注释） */
    try { LMApp.applyRemoteContent(c); } catch (e) { return; }
    noteBase(c);   /* ★ 修复121：真正应用成功后才推进共同祖先（被挂起的包不能推进） */
    try { pushFeedFrom(before, c, by); } catch (eF0) { /* noop */ }
    setTimeout(function () { repaintLocks(); enforceBans(); }, 60);
    LMApp.toast('🔄 已同步「' + (by || '其他设备') + '」的修改');
  }
  /* ★ 修复72：过期包诊断（内容不同步时先看这一行；5 秒最多一条，避免刷屏） */
  var _warnStaleAt = 0;
  function warnStale(ts) {
    const now = Date.now();
    if (now - _warnStaleAt < 5000) return;
    _warnStaleAt = now;
    try {
      console.warn('[协同·过期包] 丢弃了一次远端更新 → lastTs=' + lastTs + '（本机 ' + now
        + '，偏差 ' + Math.round((lastTs - now) / 1000) + 's）'
        + (lastTs > now + 60000 ? ' ← 本机 lastTs 在未来：两台设备时钟差太多，请在控制台执行 LMCollab.diag() 对比' : ''));
    } catch (eW) { /* noop */ }
  }
  /* ★ 修复122：坏包诊断（5 秒最多一条） */
  var _warnBadAt = 0;
  function warnBadPack(why) {
    const now = Date.now();
    if (now - _warnBadAt < 5000) return;
    _warnBadAt = now;
    try {
      console.warn('[协同·坏包] 已拒绝一份结构不合法的远端内容（' + (why || '缺少 pages / 页面结构不对')
        + '），本机内容未改动 —— 若反复出现，说明某台设备的内容已损坏，请在那台设备上「恢复初始内容」后重新编辑');
    } catch (e) { /* noop */ }
  }
  function applyRemote(msg) {
    let c = msg.content;
    if (!validContent(c)) return false;
    /* ★ 修复122：远端内容先过结构校验。缺 blocks / 缺 id 的包会把本机渲染打崩，
       而且会被当成正常内容落盘 → 刷新后本机也坏了（局域网 / MQTT / GitHub 任一条通道都能带进来） */
    if (window.LMStore && LMStore.validateContent) {
      let v = null;
      try { v = LMStore.validateContent(c); } catch (eV0) { v = null; }
      if (!v || !v.ok) { warnBadPack(v && v.why); return false; }
      if (v.repaired) { c = v.content; warnBadPack('已自动补齐字段'); }
    }
    /* ★ 修复72：force = Yjs 网状通道专用。Y.Doc 本身就只给出「更新的整包」（因果有序），
       不该再拿墙上时钟挡一道 —— 任一端时钟快一点，更新就被静默丢掉，
       表现正是「徽标上看得到有人在编辑，内容却怎么都不同步」 */
    if (!msg.force && +(msg.ts || 0) <= lastTs) { warnStale(msg.ts); return false; } /* 过期包忽略（后写优先） */
    if (localBusy()) { pending = { content: c, ts: msg.ts, by: msg.name }; return false; }
    if (verifyBanList(c)) { doApply(c, msg.ts, msg.name); return true; } /* 管理员设备会核对屏蔽名单签名，坏条目剔除后再用 */
    return false;
  }
  function flushPending() {
    if (!pending || localBusy()) return false;
    const p = pending; pending = null;
    if (verifyBanList(p.content)) { doApply(p.content, p.ts, p.by); return true; }
    return false;
  }
  function recv(msg) {
    if (!msg || msg.t !== 'lm1' || !window.LMApp) return;
    if (msg.from === me.id) return; /* 服务器会把消息回发给发送者自己，过滤 */
    try { rosterTouch(msg.from, msg.name, msg.fp, msg.page); } catch (eR) { /* 脏数据不拖垮消息处理 */ }
    try {
      switch (msg.type) {
      case 'hello':
        peers[msg.from] = { name: msg.name, fp: msg.fp, ts: msg.ts, page: msg.page };
        clearLeft(msg.from); /* 回来了：清掉「已退出页面」的短暂屏蔽 */
        if (msg.want) { /* 新设备要全量：只让「设备号最小」的那台回，避免多台同时灌 */
          const ids = Object.keys(peers).concat([me.id]).sort();
          if (ids[0] === me.id && validContent(LMApp.state.content)) send({ type: 'state', to: msg.from, content: LMApp.state.content });
        }
        presenceTick(); break;
      case 'iam':
        peers[msg.from] = { name: msg.name, fp: msg.fp, ts: msg.ts, page: msg.page };
        clearLeft(msg.from);
        presenceTick(); break;
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
        /* ★ 修复73：bye = 对方主动关页退出（不是断线）——立刻从在线名单移除并提示「已退出页面」；
           同时记下 leftIds，短暂屏蔽 Yjs awareness 的残留状态，免得刚提示退出又变回在线 */
        const goneName = (peers[msg.from] && peers[msg.from].name) || msg.name || '设备';
        delete peers[msg.from];
        if (msg.from) leftIds[msg.from] = Date.now();
        delete liveSeen[msg.from];
        peerToast({ id: msg.from, name: goneName, self: false }, 'left');
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
  /* ★ 修复71（"在线设备 2 台，协作中却写 1 台设备"）：两个数字此前是**两套口径** ——
       面板：本机 + 旧通道 peers + 花名册 3 分钟内 + Yjs Awareness，按设备号去重；
       徽章：max(1 + peers, yPeerCount())，而 yPeerCount() 返回的是
             「Awareness 状态数 − 1」= **其他设备数（不含本机）**，却当成总台数用，
             花名册里的设备也完全不计 → 两台在线时徽章只显示 1 台。
     现在并集逻辑统一抽到 deviceList()，徽章与面板都数「去重后的实时在线设备数（含本机）」，
     两处必然一致 */
  /* ★ 修复73：当前「活着」的设备快照 = 本机 + 旧通道 peers + Yjs awareness（按设备号合并） */
  function presenceSnapshot() {
    const snap = {};
    try { if (window.LMApp && LMApp.state) snap[me.id] = { id: me.id, name: me.name, fp: me.fp, page: LMApp.state.pageId || '', self: true }; } catch (e0) { /* noop */ }
    Object.keys(peers).forEach(function (k) {
      const p2 = peers[k] || {};
      snap[k] = { id: k, name: p2.name || '', fp: p2.fp || '', page: p2.page || '' };
    });
    try {
      const yj = window.LMYCollab;
      if (yj && yj.presence) yj.presence().forEach(function (p3) {
        if (!p3 || !p3.id || p3.self || leftIds[p3.id]) return; /* 刚「关页退出」的：忽略 awareness 残留 */
        const cur = snap[p3.id];
        if (!cur) snap[p3.id] = { id: p3.id, name: p3.name || '', fp: '', page: p3.page || '' };
        else if (!cur.name && p3.name) cur.name = p3.name;
      });
    } catch (eY) { /* noop */ }
    /* 退出记录 60 秒自然作废（对方刷新回来时由 hello/iam 立刻清掉） */
    const nowL = Date.now();
    Object.keys(leftIds).forEach(function (k) { if (nowL - (+leftIds[k] || 0) > 60000) delete leftIds[k]; });
    return snap;
  }
  /* ★ 修复73：状态归并（纯函数，test_yjs 直接截出来跑）——
     snap 里有的 → 在线（新出现 = join，断线回来 = back）；
     snap 里没有但之前在线 → lost（断线，先留在名单里显示「已断线 N 秒」）；
     lost 超过 goneTtl 还没回来 → gone（从名单移除 = 认为它不会再回来）。
     只做状态迁移并返回事件列表，弹提示/重绘交给 presenceTick，便于单测 */
  function presenceReduce(liveSeen, snap, now, goneTtl) {
    const events = [];
    Object.keys(snap).forEach(function (k) {
      const s2 = snap[k], cur = liveSeen[k];
      if (!cur) {
        liveSeen[k] = { id: k, name: s2.name || '', fp: s2.fp || '', page: s2.page || '', self: !!s2.self, state: 'online', last: now, lostAt: 0 };
        if (!s2.self) events.push({ kind: 'join', id: k, d: liveSeen[k] });
        return;
      }
      cur.name = s2.name || cur.name;
      cur.page = s2.page || cur.page;
      cur.fp = s2.fp || cur.fp;
      cur.last = now;
      if (cur.state !== 'online') { cur.state = 'online'; cur.lostAt = 0; events.push({ kind: 'back', id: k, d: cur }); }
    });
    Object.keys(liveSeen).forEach(function (k) {
      const d = liveSeen[k];
      if (!d || snap[k]) return;
      if (d.state === 'online') { d.state = 'lost'; d.lostAt = now; events.push({ kind: 'lost', id: k, d: d }); }
      else if (now - (+d.lostAt || 0) > goneTtl) { delete liveSeen[k]; events.push({ kind: 'gone', id: k, d: d }); }
    });
    return events;
  }
  /* 上线 / 断线 / 退出 / 重连 / 超时移除 的提示（8 秒去抖 + 启动静默期，多台不轰炸） */
  function peerToast(d, kind) {
    if (!d) return;
    const now = Date.now();
    if (!d.self && now >= presenceQuiet && now - (peerToastAt[d.id] || 0) > 8000) {
      peerToastAt[d.id] = now;
      const nm = '「' + (d.name || '设备') + '」';
      if (kind === 'join') LMApp.toast('🟢 ' + nm + ' 已上线' + (d.page ? '（在 ' + d.page + '）' : ''));
      else if (kind === 'back') LMApp.toast('🟢 ' + nm + ' 已重新连上');
      else if (kind === 'lost') LMApp.toast('🔌 ' + nm + ' 已断线（网络中断，正在重连…）');
      else if (kind === 'left') LMApp.toast('👋 ' + nm + ' 已退出页面');
      else if (kind === 'gone') LMApp.toast('⚪ ' + nm + ' ' + Math.round(GONE_TTL / 60000) + ' 分钟没回来，已从在线设备中移除');
    }
    try { paintChip(); } catch (e1) { /* noop */ }
    refreshPanel();
  }
  function panelOpen() { const p0 = document.getElementById(PANEL_ID); return !!(p0 && p0.classList.contains('show')); }
  /* 面板只在「已经打开」时重绘 —— 否则收到 hello/iam 会把面板弹出来（旧版就是这样） */
  function refreshPanel() { try { if (panelOpen()) renderPanel(); } catch (e0) { /* noop */ } }
  function clearLeft(id) { if (id) delete leftIds[id]; }
  /* 2 秒一拍的设备状态机：判定 断线 / 重连 / 超时移除，并刷新徽章与面板 */
  function presenceTick() {
    if (presenceTicking) return [];
    presenceTicking = true;
    let evs = [];
    try {
      evs = presenceReduce(liveSeen, presenceSnapshot(), Date.now(), GONE_TTL);
      evs.forEach(function (ev) { peerToast(ev.d, ev.kind); });
      if (!evs.length) { try { paintChip(); refreshPanel(); } catch (e1) { /* noop */ } }
    } catch (e) { /* 状态机永不抛出影响协作 */ }
    presenceTicking = false;
    return evs;
  }
  function deviceList() {
    const list = [];
    const seen = {};
    Object.keys(liveSeen).forEach(function (k) {
      const d = liveSeen[k];
      if (!d) return;
      seen[k] = 1;
      list.push({
        id: k, name: d.name, fp: d.fp, page: d.page, self: !!d.self,
        lost: d.state === 'lost',
        lostSec: d.state === 'lost' ? Math.max(0, Math.round((Date.now() - (+d.lostAt || 0)) / 1000)) : 0,
        editing: null
      });
    });
    /* 兜底：状态机还没跑过第一拍时也至少列本机（否则面板会短暂「0 台」且没有本机行） */
    if (!seen[me.id]) {
      seen[me.id] = 1;
      list.push({ id: me.id, name: me.name, fp: me.fp, page: (window.LMApp ? LMApp.state.pageId : ''), self: true, lost: false, lostSec: 0, editing: null });
    }
    /* 「谁在编辑」标记从 Yjs awareness 贴回来（不新增设备，只补标记；断线设备不算在编辑） */
    try {
      const yj = window.LMYCollab;
      if (yj && yj.presence) yj.presence().forEach(function (p3) {
        if (!p3 || !p3.id || p3.editing == null) return;
        const hit = list.filter(function (x) { return x.id === p3.id && !x.lost; })[0];
        if (hit) hit.editing = p3.editing;
      });
    } catch (eY2) { /* noop */ }
    const now = Date.now();
    try {
      const r = roster();
      Object.keys(r).forEach(function (k) {
        if (seen[k]) return;
        const o = r[k];
        if (now - (+o.lastSeen || 0) < 180000) list.push({ id: k, name: o.name, fp: o.fp, page: o.page || '', self: false, recent: true });
      });
    } catch (e) { /* noop */ }
    /* 排序：本机 → 在线 → 断线 → 最近活跃 */
    const rank = function (p) { return p.self ? 0 : (p.lost ? 2 : (p.recent ? 3 : 1)); };
    list.sort(function (a, b) { return rank(a) - rank(b) || String(a.name || '').localeCompare(String(b.name || '')); });
    return list;
  }
  /* 实时在线台数（含本机；断线与「最近活跃」都不计）—— 徽章与面板用的是同一个数 */
  function liveCount() {
    try {
      let n = 0;
      Object.keys(liveSeen).forEach(function (k) { const d = liveSeen[k]; if (d && d.state === 'online') n++; });
      return Math.max(1, n);
    } catch (e) { return 1; }
  }
  /* ★ 修复73：断线台数（单独报，不再混进「在线」） */
  function lostCount() {
    try {
      let n = 0;
      Object.keys(liveSeen).forEach(function (k) { const d = liveSeen[k]; if (d && d.state === 'lost') n++; });
      return n;
    } catch (e) { return 0; }
  }
  /* ★ 修复71：徽章每 6 秒对齐一次 —— 设备上下线/花名册过期不一定都有事件触发重绘，
     否则会出现"面板 2 台、徽章还是 1 台"的过期显示（paintChip 幂等，无 transports 时自动收掉徽章） */
  setInterval(function () { try { paintChip(); } catch (e) { /* noop */ } }, 6000);
  /* ★ 修复73：设备状态机 2 秒一拍 —— 断线（信号消失）/ 重连（信号回来）/ 超时移除都在这里判定；
     面板开着时同步重绘，所以「已断线 N 秒」是活的（旧版面板是点开那一刻的快照，设备掉了还显示 2 台） */
  setInterval(function () { try { presenceTick(); } catch (e2) { /* noop */ } }, 2000);
  /* ---------- Yjs 层取数（ycollab.js 未启用时安全返回空值，不影响旧通道） ---------- */
  /* 保留：Yjs「其他设备数」（不含本机）。徽章/面板已统一走 deviceList()/liveCount()，
     这个只留作诊断与外部脚本调用 —— 注意它数的是**其他设备**，别当总台数用 */
  function yPeerCount() {
    try { return (window.LMYCollab && window.LMYCollab.peerCount) ? (+window.LMYCollab.peerCount() || 0) : 0; } catch (e) { return 0; }
  }
  /* ---------- ★ 修复88：协同节奏（纯函数，test_yjs 直接提取验数字） ---------- */
  /* 场上是否「不止我这一台」：Yjs awareness 或旧通道设备状态机任一判断出来就算 */
  function peersHot() {
    try { return liveCount() > 1 || yPeerCount() > 0; } catch (e) { return false; }
  }
  /* GitHub 轮询间隔：隐藏 60s；前台且在活动（30 秒内动过）→ 2s / 有人在线 1.2s；
     前台但闲置 → 8s / 有人在线 3.5s */
  function pollGapNow(hidden, act, hot) {
    if (hidden) return POLL_HIDDEN;
    if (act) return hot ? HOT_ACTIVE : POLL_ACTIVE;
    return hot ? HOT_IDLE : POLL_IDLE;
  }
  /* 访客只读轮询间隔：前台 25s、后台仍是 90s */
  function visitorGapNow(hidden) { return hidden ? POLL_VISITOR : VISITOR_SHOWN; }
  /* 推送最小间隔：有人在线 2.6s（原来是 6s，这是跨网络协同「慢半拍」的最大单项） */
  function pushWaitMin(hot) { return hot ? HOT_PUSH_MIN : GH_PUSH_MIN; }
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
    /* ★ 修复71/73：与设备面板同一个数（本机 + 在线设备，去重）；断线的单独报出来，不再悄悄少一台 */
    const n = liveCount();
    const lost = lostCount();
    const txt = '<span class="dot' + (lost ? ' warn' : '') + '"></span>协作中 · ' + n + ' 台设备'
      + (lost ? '（' + lost + ' 台已断线）' : '') + '（' + modeLabel + yChannelLabel() + '）';
    if (chip.innerHTML !== txt) chip.innerHTML = txt; /* ★ 修复73：2 秒一拍也不重复重排 DOM */
    chip.title = '我：' + me.name + '（#' + shortId(me.id) + '）— 点开看在线 / 断线设备';
  }
  function renderPanel() {
    let pan = document.getElementById(PANEL_ID);
    if (!pan) {
      pan = document.createElement('div'); pan.id = PANEL_ID;
      document.body.appendChild(pan);
      pan.addEventListener('click', function (e) { if (e.target === pan) pan.classList.remove('show'); });
    }
    const admin = !!(window.LMApp && LMApp.state.admin);
    /* ★ 修复73：名单来自设备状态机（在线 + 断线），花名册只补「最近活跃」 */
    const list = deviceList();
    const live = list.filter(function (p) { return !p.recent && !p.lost; }).length;
    const lost = list.filter(function (p) { return p.lost; }).length;
    const recent = list.filter(function (p) { return p.recent; }).length;
    let html = '<div class="cp-t">在线设备 ' + live + ' 台'
      + (lost ? '（另 ' + lost + ' 台已断线）' : '')
      + (recent ? '（另 ' + recent + ' 台最近活跃）' : '') + '</div>';
    html += list.map(function (p) {
      return '<div class="cp-row' + (p.lost ? ' cp-row-lost' : '') + '"><b>' + escHtml(p.name || '设备') + (p.self ? '（本机）' : '')
        + (p.recent ? '<span class="cp-recent">最近活跃</span>' : '')
        + (p.lost ? '<span class="cp-lost">⚠ 已断线 ' + p.lostSec + ' 秒</span>' : '')
        + (p.editing != null ? '<span class="cp-edit">✍ 编辑中</span>' : '') + '</b>'
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
    if (pan.innerHTML !== html) pan.innerHTML = html; /* ★ 修复73：2 秒定时重绘不闪烁 */
    pan.classList.add('show');
  }
  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function sweep() {
    try {
      const now = Date.now();
      Object.keys(locks).forEach(function (k) {
        if (now - locks[k].ts > LOCK_TTL) { delete locks[k]; delete coEdit[k]; repaintLocks(); }
      });
      Object.keys(peers).forEach(function (k) { if (now - peers[k].ts > PEER_TTL) delete peers[k]; });
      /* ★ 修复73：断线 / 退出 / 重连 / 超时移除 全部交给设备状态机（2 秒一拍）——
         旧版这里只认旧通道 peers，Yjs 掉线根本没有提示 */
      presenceTick();
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
     且专有通道登录成功时会被自动清除（clearAutoBan）——保证自己永远不会被锁死在门外 */
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
        LMApp.commit({ msg: '本设备因 1 小时内多次密码错误，被自动限时限制管理员入口 30 分钟' });
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
    if (cb.bans.length !== before) LMApp.commit({ msg: '已自动解除本设备的限时限制' });
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
  /* ---------- 云端（GitHub 仓库直存 · 数据分支 + 首屏快照）----------
     ★ 修复89：内容不再写进「Pages 发布分支」（默认 main）—— 那里每写一次就触发一次 Pages 构建，
       协同半小时就能把「10 次构建/小时」的软限用光，导致「发了代码，线上还是旧版」。现在分两层：
       ▸ **数据分支**（默认 lm-data）：每次保存实时提交（2.6s / 6s 防抖），**不触发任何构建**；
       ▸ **main 上的 data/content.js**：低频快照（≤1 次 / 30 分钟）——只服务「新访客首屏」，
         因为 index.html 是从 Pages(main) 加载这个文件的。构建次数因此 ≤2 次/小时 + 发代码时。
     读：管理员走 Contents API（?ref=数据分支，If-None-Match 命中 304 不耗额度）；访客读 raw(数据分支)。
     兜底：数据分支建不出来 / 写不进去（Token 权限不足等）→ 自动回退 main（= 旧行为）并提示一次。 */
  const SNAP_MIN = 30 * 60 * 1000;   /* main 快照最小间隔 → 最多 2 次构建/小时 */
  const GH = { cfg: null, token: '', etag: '', lastPush: 0, timer: 0, inFlight: false, inFlightAt: 0, lastPullTs: 0,
               useMain: false,      /* 已回退到 main（本页会话内有效） */
               snapAt: 0,           /* 上次写 main 快照的时刻 */
               blockUntil: 0,       /* ★ 修复90：限流/退避到期时刻，到期前一律不写（越撞越死） */
               rateLeft: null,      /* ★ 修复90：X-RateLimit-Remaining 观测值 */
               lastText: '',        /* ★ 修复90：上次成功推送的文件文本，内容没变就不重复 PUT */
               mergedTs: 0,         /* ★ 修复105：已按块级合并过的云端版本戳（同一份不反复合并） */
               _mk: null };         /* 建数据分支的进行中 Promise（去重） */
  const shaOf = {};                  /* 分支 → 该文件 blob sha（乐观锁缓存，按分支分开） */
  /* 内容分支：默认数据分支；dataBranch:'' → 跟随 branch；未配置 → lm-data（判定在 store.js） */
  function ghDataRef() {
    try { return (window.LMStore && LMStore.dataRefOf) ? LMStore.dataRefOf(GH.cfg) : ((GH.cfg && GH.cfg.branch) || 'main'); }
    catch (e) { return 'main'; }
  }
  function ghMainRef() { return (GH.cfg && GH.cfg.branch) || 'main'; }
  /* 当前实际读写的分支（回退后就是 main） */
  function ghBranch() { return GH.useMain ? ghMainRef() : ghDataRef(); }
  /* 快照是否到期（纯函数，test_yjs 直接提取验数字） */
  function snapDue(now, lastAt, minGap) { return !lastAt || (now - lastAt) >= minGap; }
  /* ★ 修复90：剩余额度 → 推送最小间隔（0 = 不用放慢）。GitHub 认证 API 5000 次/小时，
     只有「真的写/真读新内容」才计数（If-None-Match 命中 304 不耗额度），所以额度紧张时只需放慢写。
     多人长时间同时编辑，每人 ~1400 次 PUT/小时，理论上能撞到 5000 —— 这里让它自动降挡而不是撞 403 后哑掉 */
  function rateGapOf(left) {
    const n = (left == null || left === "") ? NaN : +left;
    if (isNaN(n)) return 0;
    if (n <= 200) return 30000;     /* 快见底：30 秒一写（≈120 次/小时） */
    if (n <= 800) return 12000;     /* 偏紧：12 秒一写（≈300 次/小时） */
    return 0;                       /* 充裕：按 2.6s / 6s 正常推 */
  }
  function rateGap() { return rateGapOf(GH.rateLeft); }
  /* ★ 修复90：403/429 退避多久 —— 优先 Retry-After，其次 X-RateLimit-Reset，兜底 60 秒（上限 5 分钟） */
  function retryAfterMs(r) {
    try {
      const ra = r && r.headers && r.headers.get ? r.headers.get('Retry-After') : '';
      if (ra) {
        const n = +ra;
        if (!isNaN(n)) return Math.min(300000, Math.max(1000, n * 1000));
        const d = Date.parse(ra);
        if (!isNaN(d)) return Math.min(300000, Math.max(1000, d - Date.now()));
      }
      const reset = r && r.headers && r.headers.get ? r.headers.get('X-RateLimit-Reset') : '';
      if (reset) {
        const ms = (+reset) * 1000 - Date.now();
        if (ms > 0) return Math.min(300000, ms);
      }
    } catch (e) { /* noop */ }
    return 60000;
  }
  /* 从响应头记下剩余额度（260/261 都在带） */
  function noteRate(r) {
    try {
      const v = r && r.headers && r.headers.get ? r.headers.get('X-RateLimit-Remaining') : '';
      if (v !== "" && v != null && !isNaN(+v)) GH.rateLeft = +v;
    } catch (e) { /* noop */ }
  }
  const SNAP_TS_KEY = 'lm_gh_snap_ts';   /* ★ 修复90：快照时间戳落到本机，刷新页面不会重置 30 分钟窗口 */
  function ghApi() {
    const path = (GH.cfg.path || 'data/content.js').replace(/^\/+/, '');
    return 'https://api.github.com/repos/' + encodeURIComponent(GH.cfg.owner) + '/'
      + encodeURIComponent(GH.cfg.repo) + '/contents/' + path.split('/').map(encodeURIComponent).join('/');
  }
  function ghRaw() {
    const path = (GH.cfg.path || 'data/content.js').replace(/^\/+/, '');
    return 'https://raw.githubusercontent.com/' + GH.cfg.owner + '/' + GH.cfg.repo + '/'
      + encodeURIComponent(ghBranch()) + '/' + path.split('/').map(encodeURIComponent).join('/') + '?t=' + Date.now();
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
  /* ★ 修复122：带超时的 fetch —— 旧代码一个超时都没有。手机切网 / 信号盲区 / 运营商黑洞时
     fetch 可能永远不落定，而 GH.inFlight 只在 promise 落定后复位 → 此后 ghPull / ghPush
     全部早退，云端同步彻底停摆（徽章也不动），只能刷新页面才恢复。
     现在：超过时限 abort → promise 落到 catch → inFlight 复位 → 下一轮自动重来。 */
  function fetchT(url, opt, ms) {
    if (typeof AbortController === 'undefined') return fetch(url, opt);
    const ctl = new AbortController();
    const t = setTimeout(function () { try { ctl.abort(); } catch (eA) { /* noop */ } }, ms || 20000);
    const o = Object.assign({}, opt || {}, { signal: ctl.signal });
    return fetch(url, o).then(function (r) { clearTimeout(t); return r; },
      function (e) { clearTimeout(t); throw e; });
  }
  /* ★ 修复122：兜底看门狗 —— 万一某些环境 abort 不生效（旧 WebView / 已断网的内核），
     inFlight 超过 60 秒就强制复位，宁可多发一次请求也不让同步永久卡死。 */
  function inFlightStale() {
    if (!GH.inFlight) { GH.inFlightAt = 0; return false; }
    const now = Date.now();
    if (!GH.inFlightAt) { GH.inFlightAt = now; return false; }
    if (now - GH.inFlightAt < 60000) return false;
    GH.inFlight = false; GH.inFlightAt = 0;
    try { console.warn('[协同·云端] 上一次请求 60 秒没返回，已强制复位同步锁（接下来会自动重试）'); } catch (e) { /* noop */ }
    return true;
  }
  function ghPull() {
    if (!GH.cfg) return;
    inFlightStale();                       /* ★ 修复122 */
    if (GH.inFlight) return;
    GH.inFlight = true; GH.inFlightAt = Date.now();
    const useApi = !!GH.token;
    const ref = ghBranch();
    const url = useApi ? (ghApi() + '?ref=' + encodeURIComponent(ref)) : ghRaw();
    const opt = useApi ? { headers: { 'Authorization': 'Bearer ' + GH.token, 'Accept': 'application/vnd.github+json' } } : {};
    if (useApi && GH.etag) opt.headers['If-None-Match'] = GH.etag; /* 条件请求：没更新时返回 304，且不消耗 API 限额 */
    fetchT(url, opt, 15000).then(function (r) {
      noteRate(r);                                  /* ★ 修复90：记下剩余额度 */
      if (r.status === 304) return null;             /* 云端没变化（且不耗额度） */
      /* ★ 修复90：访客只读。若数据分支还不存在（管理员尚未落库成功 / Token 无建分支权限），
         改读发布分支 —— 内容一定在那里；否则访客会永远停在首屏快照上看不到更新 */
      if (r.status === 404 && !useApi && !GH.useMain && ghDataRef() !== ghMainRef()) {
        GH.useMain = true; GH.etag = ''; GH.timer = 0;
        GH.inFlight = false;
        setTimeout(ghPull, 40);
        return null;
      }
      if (!r.ok) throw new Error('http ' + r.status);
      if (useApi) { const et = r.headers.get('etag'); if (et) GH.etag = et; }
      return r.json().then(function (j) {
        if (useApi) { shaOf[ref] = j.sha; return parseFileText(atobUh(j.content)); }
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
         管理员（可写）原来在这里**无条件 return** —— 见下方修复105。 */
      if (GH.token) {
        /* ★ 修复105（「手机改了，电脑一两分钟都没反应，刷新才看到」）：
           管理员这条路径原来直接 return，于是只要本机保存过一次（lastTs = 本机此刻，永远比云端那份新），
           另一台设备的修改就**永远进不来**：本机越编辑越新，云端的包一直被当「过期」丢掉。
           现在只要云端内容与本机**不同**就吸收，走的还是块级后写优先（mergeBlocks）：
           本机更晚改的块照旧保住（_ts 更新者胜），对方改的块应用 —— 与 Yjs / 旧通道同一个合并漏斗，
           不会互相整包覆盖，也不会卡住。同一份云端版本只合并一次（GH.mergedTs 记账）。 */
        if (GH.mergedTs === ts) return;
        let same = false;
        try { same = JSON.stringify(c) === JSON.stringify(LMApp.state.content); } catch (eS0) { same = false; }
        if (same) { GH.mergedTs = ts; return; }
        if (localBusy() || !verifyBanList(c)) return;   /* 本机正在输入 → 下一轮再来，不打断 */
        let merged = null;
        try { merged = mergeBlocks(JSON.parse(JSON.stringify(c))); } catch (eM0) { return; }
        let sameM = false;
        try { sameM = JSON.stringify(merged) === JSON.stringify(LMApp.state.content); } catch (eS1) { sameM = false; }
        if (sameM) { GH.mergedTs = ts; return; }        /* 合并后没有实质变化：记账后不再重算 */
        try {
          LMApp.applyRemoteContent(merged);
          if (window.LMStore) LMStore.saveLocal(LMApp.state.content);
          GH.mergedTs = ts;
        } catch (eD0) { return; }
        setTimeout(function () { repaintLocks(); enforceBans(); }, 60);
        LMApp.toast('🔄 已吸收「云端（GitHub）」另一台设备的修改');
        return;
      }
      try { if (JSON.stringify(c) === JSON.stringify(LMApp.state.content)) return; } catch (eC) { return; }
      if (localBusy() || !verifyBanList(c)) return;
      try {
        LMApp.applyRemoteContent(mergeBlocks(c));
        noteBase(LMApp.state.content);   /* ★ 修复121：应用后本机内容即新的共同祖先（与 doApply 保持一致） */
        if (window.LMStore) LMStore.saveLocal(LMApp.state.content);
      } catch (eD) { return; }
      setTimeout(function () { repaintLocks(); enforceBans(); }, 60);
      LMApp.toast('🔄 已同步「云端（GitHub）」的修改');
    }).catch(function () { GH.inFlight = false; });
  }
  /* ★ 修复89：数据分支不存在时按需创建（复用 store.js 的同一实现，避免两份建分支逻辑） */
  function ensureDataBranch() {
    const br = ghDataRef(), main = ghMainRef();
    if (br === main) return Promise.resolve(true);
    if (GH._mk) return GH._mk;
    const store = window.LMStore;
    if (!store || !store.ensureBranchRef) return Promise.resolve(false);
    GH._mk = Promise.resolve(store.ensureBranchRef(GH.cfg, br, GH.token, main))
      .then(function (ok) { GH._mk = null; return !!ok; }, function () { GH._mk = null; return false; });
    return GH._mk;
  }
  /* main 快照：≤1 次 / 30 分钟，只为「新访客首屏」不是陈年内容；失败静默，绝不影响实时同步 */
  function maybeSnapshot(text) {
    try {
      const main = ghMainRef();
      if (ghBranch() === main) return;                 /* 回退态已在写 main，无需快照 */
      const now = Date.now();
      /* ★ 修复90：窗口状态落到本机 —— 否则每刷新一次页面 snapAt 归零，
         连刷 10 次就又能写 10 次 main = 10 次构建，「30 分钟一次」形同虚设 */
      if (!GH.snapAt) { try { GH.snapAt = (+(localStorage.getItem(SNAP_TS_KEY) || 0)) || 0; } catch (eT) { GH.snapAt = 0; } }
      if (!snapDue(now, GH.snapAt, SNAP_MIN)) return;
      GH.snapAt = now;
      try { localStorage.setItem(SNAP_TS_KEY, String(now)); } catch (eS) { /* noop */ }
      const S = window.LMStore;
      if (!S) return;
      const b64 = S.utf8ToBase64 ? S.utf8ToBase64(text) : btoa(unescape(encodeURIComponent(text)));
      const H = { 'Authorization': 'Bearer ' + GH.token, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' };
      const body = { message: '内容快照（供首屏加载）' + new Date().toLocaleString('zh-CN'), content: b64, branch: main };
      const url = ghApi();
      const getSha = shaOf[main] ? Promise.resolve(shaOf[main])
        : fetchT(url + '?ref=' + encodeURIComponent(main), { headers: H }, 15000)
          .then(function (r) { return r.ok ? r.json().then(function (j) { return j.sha; }) : null; });
      getSha.then(function (sha) {
        if (sha) body.sha = sha;
        return fetchT(url, { method: 'PUT', headers: H, body: JSON.stringify(body) }, 30000);
      }).then(function (r) {
        if (!r.ok) { delete shaOf[main]; return; }      /* 409 等：下次重新取 sha */
        return r.json().then(function (j) { shaOf[main] = j.content && j.content.sha; });
      }).catch(function () { /* 快照失败：下次再试 */ });
    } catch (e) { /* noop */ }
  }
  function ghPush(content) {
    if (!GH.cfg || !GH.token || !window.LMStore) return;
    /* 防旧覆盖新守卫：最近一次轮询看到的云端版本比本机内容新（其他设备刚推过）→
       本机不推送（避免旧内容盖掉别人的新内容），改为立即拉取应用 */
    const myTs = +(((content.config || {}).collab || {}).syncTs || 0);
    if (GH.lastPullTs > myTs) { ghPull(); return; }
    const now = Date.now();
    if (now < GH.blockUntil) return;   /* ★ 修复90：限流/退避期内不写，避免越撞越死 */
    inFlightStale();                   /* ★ 修复122：卡死的锁先复位（abort 不生效时兜底） */
    if (GH.inFlight) return;
    /* ★ 修复90：额度紧张时把推送间隔自动拉长（rateGap）；额度充裕时完全不受影响 */
    const wait = Math.max(pushWaitMin(peersHot()), rateGap()) - (now - GH.lastPush); /* ★ 修复88：有人在线 → 2.6s 就推，不再死等 6s */
    if (wait > 0) { /* 防抖：连续保存只在安静一小会儿后补推最新版（尾随触发，不会漏推） */
      if (!GH._defer) GH._defer = setTimeout(function () {
        GH._defer = null;
        if (window.LMApp && validContent(LMApp.state.content)) ghPush(LMApp.state.content);
      }, wait + 80);
      return;
    }
    if (GH._defer) { clearTimeout(GH._defer); GH._defer = null; }
    const ref = ghBranch();      /* ★ 修复89：默认写数据分支（不触发 Pages 构建） */
    const text = LMStore.buildFileText(content);
    /* ★ 修复90：与上次成功推送的文本完全一致 → 不发 PUT（协同里很多 commit 只动了时间戳，纯白烧额度） */
    if (text === GH.lastText) return;
    GH.lastPush = now;
    GH.inFlight = true; GH.inFlightAt = Date.now();   /* ★ 修复122：记时刻，供看门狗判定 */
    const b64 = LMStore.utf8ToBase64 ? LMStore.utf8ToBase64(text) : btoa(unescape(encodeURIComponent(text)));
    const H = { 'Authorization': 'Bearer ' + GH.token, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' };
    const put = function (br, sha) {
      const body = { message: '协作同步（' + me.name + '）' + new Date().toLocaleString('zh-CN'), content: b64, branch: br };
      if (sha) body.sha = sha;
      return fetchT(ghApi(), { method: 'PUT', headers: H, body: JSON.stringify(body) }, 30000);
    };
    const getSha = function (br) {
      if (shaOf[br]) return Promise.resolve(shaOf[br]);
      return fetchT(ghApi() + '?ref=' + encodeURIComponent(br), {
        headers: { 'Authorization': 'Bearer ' + GH.token, 'Accept': 'application/vnd.github+json' }
      }, 15000).then(function (r) { return r.ok ? r.json().then(function (j) { return j.sha; }) : null; });
    };
    const tryPut = function (br) {
      return getSha(br).then(function (sha) {
        const had = !!sha;
        return put(br, sha).then(function (r) {
          /* 文件与分支都不存在（数据分支还没建）→ 建分支后重试一次；已有文件却 422 = 冲突，交给外层 */
          if (!had && (r.status === 422 || r.status === 404) && br !== ghMainRef()) {
            return ensureDataBranch().then(function (ok) {
              /* 建分支失败（Token 没有建 ref 的权限）→ 用 status 0 交给外层走「回退 main」，
                 绝不能原样返回 422：外层会把 422 当「别人先提交」每 6 秒重试，永远退化不下去 */
              if (!ok) return { ok: false, status: 0, _mkFail: true };
              delete shaOf[br];
              return getSha(br).then(function (s2) { return put(br, s2); });
            });
          }
          return r;
        });
      });
    };
    tryPut(ref).then(function (r) {
      GH.inFlight = false;
      noteRate(r);                       /* ★ 修复90：记下剩余额度，决定下一轮要不要降挡 */
      if (r.status === 409 || r.status === 422) { /* 别人先提交 → 拉最新；6 秒后尾随重推一次（防 409 后最后一笔只留本机） */
        delete shaOf[ref]; ghPull();
        if (!GH._409T) GH._409T = setTimeout(function () {
          GH._409T = null;
          if (window.LMApp && validContent(LMApp.state.content)) ghPush(LMApp.state.content);
        }, 6000);
        return;
      }
      if (!r.ok) {
        /* ★ 修复90：只有「分支真的不存在」才是降级信号（404 / 建 ref 失败）。
           403·429 = 限流、401 = Token 失效、5xx = 暂时故障 —— 它们跟分支无关，**绝不能**降级到 main：
           旧写法会把一次限流误判成「权限不足」，永久退回发布分支，白烧构建配额 */
        const branchMissing = !!r._mkFail || r.status === 404;
        if (r.status === 403 || r.status === 429) {
          const ms = retryAfterMs(r);
          GH.blockUntil = Date.now() + ms;
          if (!GH._rlToast) {
            GH._rlToast = true;
            toast('⏳ GitHub 写入额度/频率受限：已自动放慢同步（退避 ' + Math.round(ms / 1000) + ' 秒），内容留在本机不会丢');
          }
          return;
        }
        if (r.status === 401) {
          if (!GH._authToast) {
            GH._authToast = true;
            toast('🔑 GitHub Token 无效或已过期：请到「☁ 同步到 GitHub」重新粘贴（其他设备的内容同步不受影响）');
          }
          GH.blockUntil = Date.now() + 120000;
          return;
        }
        if (!branchMissing) return;   /* 5xx / 其他：下个周期再试，不动分支策略 */
        if (!GH.useMain && ghDataRef() !== ghMainRef()) {
          const bad = ghDataRef();
          GH.useMain = true;
          GH.etag = ''; delete shaOf[ghMainRef()];
          toast('⚠ 数据分支「' + bad + '」不可用（Token 权限或分支受限），已回退到 ' + ghMainRef() + '：内容同步照常，但会触发 Pages 构建');
          if (window.LMApp && validContent(LMApp.state.content)) ghPush(LMApp.state.content);
        }
        return;
      }
      GH.lastText = text;               /* ★ 修复90：记下已推送文本，供下一轮去重 */
      return r.json().then(function (j) {
        shaOf[ref] = j.content && j.content.sha;
        /* ★ 修复62 / 83：上传成功 → 只重拍「最近上传版」pushSnap，绝不再动 adminSnap */
        try {
          if (window.LMApp && validContent(LMApp.state.content)) {
            if (LMApp.takePushSnap) LMApp.takePushSnap();
            else if (LMApp.takeAdminSnap) LMApp.takeAdminSnap(); /* 旧版兜底 */
          }
        } catch (eSnap) { /* noop */ }
        maybeSnapshot(text);   /* ★ 修复89：顺带刷新 main 快照（≤2 次/小时，只喂首屏） */
      });
    }).catch(function () { GH.inFlight = false; });
  }
  function ghInit() {
    if (window.LM_COLLAB_SERVER) return; /* 课堂服务器在场时以它为准（局域网最快） */
    /* 可重入：管理员登录（拿到 Token）后由 refreshGh 再次调用，自动升级为上传通道 */
    try { GH.cfg = window.LMStore ? LMStore.getGhCfg() : null; } catch (e) { GH.cfg = null; }
    GH.token = (window.LMStore && LMStore.ghToken()) || '';
    /* ★ 修复90：换了仓库/分支/数据分支/路径 → 清掉上一套缓存。
       不清就会用旧分支的 sha 去写新分支（必 409），或把「已回退 main」的错误状态一直粘着 */
    const _sig = GH.cfg ? [GH.cfg.owner, GH.cfg.repo, GH.cfg.branch, GH.cfg.dataBranch, GH.cfg.path, GH.token ? 1 : 0].join('|') : '';
    if (_sig !== GH._sig) {
      GH._sig = _sig;
      GH.useMain = false; GH.etag = ''; GH.lastText = ''; GH.blockUntil = 0; GH.rateLeft = null;
      Object.keys(shaOf).forEach(function (k) { delete shaOf[k]; });
    }
    if (GH.cfg && GH.cfg.owner && GH.cfg.repo && GH.token) {
      if (GH._wired !== 'admin') {
        GH._wired = 'admin';
        transports.push({ send: function (msg) { if (msg.type === 'commit' && msg.content) ghPush(msg.content); } });
        modeLabel = '本机+云端';
        /* ★ 修复88：节拍 2s → 600ms。旧版「每 2 秒才检查一次、且要够 2 秒才拉」在定时器抖动下
           实际常变成 4 秒一次（用户感受就是「在线协同更新很慢」）；现在按 gap 判定，误差 ≤600ms。
           有人在线时 gap 自动切到 1.2s / 3.5s，没别人时仍是 2s / 8s 省流量 */
        setInterval(function () {
          const hidden = document.visibilityState === 'hidden';
          const act = Date.now() - (window._lmLastAct || 0) < 30000;
          const gap = pollGapNow(hidden, act, peersHot());
          if (!GH.timer || Date.now() - GH.timer >= gap) { GH.timer = Date.now(); ghPull(); }
        }, 600);
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
        /* ★ 修复88：访客从前台 90 秒才刷一次 → 25 秒（后台仍 90 秒）。raw 请求已带 ?t= 破缓存，
           所以手机访客看别人改的内容不再「要等一分半」 */
        setInterval(function () {
          const gap = visitorGapNow(document.visibilityState === 'hidden');
          if (!GH.timer || Date.now() - GH.timer >= gap) { GH.timer = Date.now(); ghPull(); }
        }, 1000);
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
    if (transports.length) { presenceTick(); paintChip(); hello(); if (!_sweepsOn) { _sweepsOn = true; setInterval(sweep, 6000); setInterval(hello, 8000); } }
    setTimeout(cfgWatch, 45000); setInterval(cfgWatch, 180000); /* 配置漂移自愈：45 秒后首查 + 每 3 分钟复查 */
    ['mousedown', 'keydown', 'touchstart'].forEach(function (ev) {
      document.addEventListener(ev, function () { window._lmLastAct = Date.now(); }, { passive: true });
    });
    window.addEventListener('hashchange', function () { setTimeout(notifyPagePeers, 900); }); /* 切页后等渲染稳定再提醒 */
    document.addEventListener('mousedown', function () { pointerDown = true; pointerAt = Date.now(); }, true);
    document.addEventListener('mouseup', function () { pointerDown = false; pointerAt = 0; flushPending(); }, true);
    /* ★ 修复72：指针事件丢失兜底（拖拽时在窗口外松手 / 触屏 pointercancel / 切后台再回来）——
       旧逻辑一旦收不到 mouseup，pointerDown 恒为真，远端包就永远挂起（只有刷新才恢复） */
    document.addEventListener('pointercancel', function () { pointerDown = false; pointerAt = 0; }, true);
    window.addEventListener('blur', function () { pointerDown = false; pointerAt = 0; flushPending(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      pointerDown = false; pointerAt = 0; flushPending();
      /* ★ 修复88：手机切回前台立刻补拉一次 + 马上重播自己的 presence（否则要等下一个轮询
         周期，15 秒后别人那边才重新看到「你在编辑」，看着就像「很久才同步」） */
      try { if (GH.cfg) { GH.timer = Date.now(); ghPull(); } } catch (eVis) { /* noop */ }
      try { if (window.LMYCollab && window.LMYCollab.wake) window.LMYCollab.wake(); } catch (eWk) { /* noop */ }
    });
    /* ★ 修复88：网络恢复（地铁/电梯出来）立刻补拉，不等下一个周期 */
    window.addEventListener('online', function () {
      try { if (GH.cfg) { GH.timer = 0; ghPull(); } } catch (eOn) { /* noop */ }
      try { hello(); } catch (eOn2) { /* noop */ }
    });
    /* ★ 修复72：挂起包定时分流 —— 不再只等 mouseup / focusout：用户只是「停手不动」时，
       对方的内容也能在 1 秒内自己出现，不必再点一下页面 */
    setInterval(function () { if (pending) flushPending(); }, 800);
    /* ★ 修复72：记录「真的在打字」的时刻（localBusy 只认这个，不再认「光标停在哪」） */
    document.addEventListener('keydown', function () { lastKeyAt = Date.now(); }, true);
    document.addEventListener('input', function () { lastKeyAt = Date.now(); }, true);
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
    refreshGh: ghInit, /* 团队密码登录取回 Token 后重探云端通道（ghInit 已重入化，不会重复接线） */
    dropGhSha: function () {   /* ★ 修复90：手动同步成功后清 sha 缓存（否则下一笔自动推送必 409、白跑一轮） */
      try { delete shaOf[ghBranch()]; } catch (e) { /* noop */ }
    },
    renderPanel: renderPanel,
    presenceTick: presenceTick, /* ★ 修复73：awareness 增减时由 ycollab 立刻催一拍，不必等 2 秒定时 */
    devices: function () { return deviceList(); },
    applyExternal: function (c, by) { /* Yjs 网状协同与旧通道共用同一个「远端应用」漏斗 */
      /* ★ 修复72：force 绕过墙上时钟门（Y.Doc 只会给更新的整包）；返回值告诉调用方「真的应用了吗」
         —— 包被挂起（本机正在输入）时状态还没更新，调用方不能再把旧内容回写 Y.Doc */
      try { return applyRemote({ content: c, ts: Date.now(), name: by || '其他设备', force: true }) === true; } catch (eA) { return false; }
    },
    diag: function () { /* ★ 修复72：协同自检（两台设备各在控制台执行 LMCollab.diag() 对比） */
      const o = {
        本机时间: new Date().toLocaleString(),
        lastTs偏差秒: Math.round((lastTs - Date.now()) / 1000),
        正在输入: localBusy(),
        距上次按键毫秒: lastKeyAt ? Date.now() - lastKeyAt : -1,
        指针按住: pointerDown,
        挂起的包: pending ? (pending.by || '未知') : '',
        正在编辑块: myEditing,
        Yjs就绪: !!(window.LMYCollab && window.LMYCollab.yjs),
        Yjs同伴: (window.LMYCollab && window.LMYCollab.peerCount) ? window.LMYCollab.peerCount() : 0,
        在线设备: liveCount(),
        通道: modeLabel,
        内容分支: (function () { try { return ghBranch() + (GH.useMain ? '（已回退 main）' : '') + (ghBranch() !== ghMainRef() ? '（不触发 Pages 构建）' : ''); } catch (e) { return '?'; } })(),
        额度剩余: (GH.rateLeft == null ? '未知（还没收到 GitHub 响应头）' : (GH.rateLeft + ' 次/小时 · 当前推送间隔 ' + (Math.max(pushWaitMin(peersHot()), rateGap()) / 1000) + ' 秒')),
        /* ★ 修复88：现场可核对当前节奏（有人在线会自动更快） */
        节奏: (function () {
          try {
            const hot = peersHot();
            const gap = pollGapNow(document.visibilityState === 'hidden', Date.now() - (window._lmLastAct || 0) < 30000, hot);
            return { 有人在线: hot, 轮询秒: gap / 1000, 推送最小间隔秒: pushWaitMin(hot) / 1000 };
          } catch (eR2) { return '未知'; }
        })()
      };
      try { console.log('【协同自检】', o); } catch (eD) { /* noop */ }
      return o;
    }
  };
})();
