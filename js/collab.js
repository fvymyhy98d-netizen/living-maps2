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
  var GH_PUSH_MIN = 2500, POLL_ACTIVE = 1000, POLL_IDLE = 2000, POLL_HIDDEN = 20000, POLL_VISITOR = 45000;
  /* ★ 修复88：**有人在线就提速** —— 除本机外还有设备在线时：推送防抖 2.5s→0.8s、活动轮询 1s→0.8s、
     闲置轮询 2s→1s；只有自己一台时保持稍慢的节奏（省流量 / 省电 / 省 GitHub 写入）。
     访客（只读）前台 4s（raw 请求带 ?t= 破缓存，拿到的就是最新版）。
     这些数值都能在控制台 LMCollab.diag() 里直接看到，方便现场核对。

     ★ 修复142（「协同时内容还是不能及时同步」的**节拍**环节）：
     旧值（独自 6s 推 / 8s 拉、访客 25s）配合下面 peersHot() 的那个洞，等于**永远跑慢挡**：
     一次保存要 1.2s(编辑器停手) + ≤6s(推送防抖) + ≤8s(对端轮询) ≈ 15 秒才到对面。
     条件请求命中 304 **不耗** GitHub 额度（只有真变更才计费），所以拉取可以放开。

     ★ 修复150（「能同步了，但很慢」）：把这条链上剩下的每个等待段都砍一刀 ——
       ① 编辑器「退出键入」本来就立刻 saveEdited（不等 1.2s 防抖），这一环不用动；
       ② 推送闸门：独自 4s→2.5s、有人在线 1.5s→0.8s；退出键入的硬底 700ms→400ms；
       ③ 对端轮询：独自闲置 4s→2s、活动 1.5s→1s；有人在线闲置 2s→1s、活动 1.2s→0.8s；
          轮询节拍器 600ms→300ms（gap 判定误差从 ±600ms 收到 ±300ms）；
       ④ 隐藏 60s→20s、访客前台 8s→4s（手机切走再切回来不必干等）。
     结果：稳态 1.5～2.5 秒（旧 4～7 秒）。GitHub 作为传输通道的**物理下限**约 1～2 秒
     （PUT/GET 各一次往返 + 一次轮询粒度），再快只能换长连接（node server.js 的 SSE /
     同浏览器 BroadcastChannel）。 */
  var HOT_PUSH_MIN = 800, HOT_ACTIVE = 800, HOT_IDLE = 1000, VISITOR_SHOWN = 4000;
  /* ★ 修复140：退出键入（focusout）/ 切后台 / 关页面 → 无视上面的防抖立刻发一次；
     但留 400ms 硬底，连续点十个框也只发一笔，不会把 GitHub 写入额度打光 */
  var FLUSH_HARD_MIN = 400;
  var me = readDevice();
  var lastTs = +(localStorage.getItem(TS_KEY) || 0);
  /* ★ 修复153（「电脑改了五分钟，手机还没同步」的第一真凶，跨会话累积）：
     lastTs 是「本机已应用到的内容版本」，存在 localStorage 里。只要这台设备的时钟被调快过
     （手机自动对时、跨时区、手动改时间都算），就会存下一个**未来时刻**：此后对端按真实时间
     发来的每一包都 <= lastTs，全被判成「过期包」丢掉 —— 直到本机时钟追上那个未来时刻（几分钟）
     才恢复。用户感受就是「他改了五分钟我这都没动静，然后突然全来了」。
     启动时自愈：未来戳一律归零，重新从对端的版本开始建立。 */
  if (lastTs > Date.now() + 60000) {
    const _skew = Math.round((lastTs - Date.now()) / 1000);
    lastTs = 0;
    try { localStorage.removeItem(TS_KEY); } catch (eT0) { /* noop */ }
    try { console.warn('[协同·自愈] 本机存着一个「未来」的内容版本戳（设备时钟曾快过 ' + _skew + ' 秒），已重置基线 —— 这正是一直收不到别人修改的原因'); } catch (eT1) { /* noop */ }
  }
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
    /* ★ 修复142：把「本机发号器」顶到见过的最大版本戳之上 ——
       nextSyncTs() = max(现在, _pubTs + 1)，所以下一次 publish 出来的戳**一定**比云端那份新。
       旧版只抬 lastTs 不抬 _pubTs：对端时钟快几十秒时，本机每次保存出来的戳都比云端小，
       ghPush 里的 `GH.lastPullTs > myTs` 守卫就会把**每一笔**都改道成"先拉"，本机内容永远上不了云
       （现场表现：对方改的能进来，我改的对方几分钟都看不见）。 */
    if (ts > (_pubTs || 0)) _pubTs = ts;
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
  /* ★ 修复149：弹窗不再「开多久就挡多久」。旧版只要 `.modal-mask` 存在就一直算忙，
     「⚙ 页面设置」这种常驻面板一开，别人的修改就全部堆在 pending 里出不来 ——
     现场表现正是「另一台设备改了，我这边一点动静都没有」。
     现在：① 裁剪层 / 带 #blockForm 的表单（正在改某一块的字段，下标随时可能位移）→ 仍然一定让路；
            ② 其它弹窗（页面设置、同步设置、条目树…）只让 12 秒 —— 够点选，之后照常吸收远端 */
  var BUSY_MODAL_WIN = 12000;
  var _modalAt = 0;
  function localBusy() {
    if (!window.LMApp) return true;
    if (document.querySelector('.crop-overlay')) return true;
    const mask = document.querySelector('.modal-mask');
    if (mask) {
      if (mask.querySelector('#blockForm')) { _modalAt = 0; return true; }
      if (!_modalAt) _modalAt = Date.now();
      if (Date.now() - _modalAt < BUSY_MODAL_WIN) return true;
    } else { _modalAt = 0; }
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
  /* ★ 修复151 · 三向文本合并（同一段两人同时打字，尽量两边都保住）
     以共同祖先 b 为锚，算出「本机改的区间」和「远端改的区间」：
       ▸ 两段区间**不重叠**（一个在前面改、一个在后面改）→ 两处改动都保留；
       ▸ 区间重叠（真的改在同一个字上）→ 返回 null，交给调用方按 _ts 后写优先。
     返回 null = 「合不了，请按时间戳决定」；绝不返回空串（空串等于删内容）。 */
  function commonPre(a, b2) {
    const n = Math.min(a.length, b2.length);
    let i = 0;
    while (i < n && a.charCodeAt(i) === b2.charCodeAt(i)) i++;
    return i;
  }
  function commonSuf(a, b2) {
    const n = Math.min(a.length, b2.length);
    let i = 0;
    while (i < n && a.charCodeAt(a.length - 1 - i) === b2.charCodeAt(b2.length - 1 - i)) i++;
    return i;
  }
  function mergeText3(b, l, r) {
    if (typeof b !== 'string' || typeof l !== 'string' || typeof r !== 'string') return null;
    if (l === r) return l;
    if (r === b) return l;
    if (l === b) return r;
    const pl = commonPre(b, l), pr = commonPre(b, r);
    let sl = commonSuf(b, l), sr = commonSuf(b, r);
    if (pl + sl > b.length) sl = b.length - pl;    /* 前/后缀不许交叉，否则区间会反转 */
    if (pr + sr > b.length) sr = b.length - pr;
    if (pl + sl > l.length) sl = l.length - pl;    /* 本机串比 base 短时同样要夹住 */
    if (pr + sr > r.length) sr = r.length - pr;
    /* base 里被替换的区间（左闭右开）与各自替换用的文本 */
    const lB0 = pl, lB1 = Math.max(lB0, b.length - sl);
    const rB0 = pr, rB1 = Math.max(rB0, b.length - sr);
    const lTxt = l.slice(pl, Math.max(pl, l.length - sl));
    const rTxt = r.slice(pr, Math.max(pr, r.length - sr));
    if (lB1 < rB0) return b.slice(0, lB0) + lTxt + b.slice(lB1, rB0) + rTxt + b.slice(rB1);
    if (rB1 < lB0) return b.slice(0, rB0) + rTxt + b.slice(rB1, lB0) + lTxt + b.slice(lB1);
    return null;   /* 同一处（含同一点插入）两边都动了 → 交给后写优先 */
  }
  /* 只有这些「长文本」字段值得做三向合并；align / id / 颜色逐字合并没有意义 */
  var TEXT_FIELDS = { text: 1, html: 1, title: 1, name: 1, body: 1, caption: 1, note: 1, content: 1, desc: 1, description: 1 };
  /* ---------- ★ 修复151：页面（栏目）级 —— 并集 + 墓碑，永不「因为对方没有」就删页 ----------
     现场（GitHub lm-data 真实提交）：10-31 22:01:17 还是 9 页（含 🧠认知地图），
     22:01:57 就变成 8 页 —— 认知地图从此消失；11-01 的两次首屏快照同样只有 8 页。
     三条独立的丢页路径，全部出在「整包覆盖」：
       ① mergeBlocks 旧逻辑：`base.pages.length !== c.pages.length` → 直接 return c（整包取远端）。
          任何一台「少一页」的设备（离线时没收到新建页 / 缓存了旧首屏）一推，全网跟着少；
       ② store.pickNewer 旧逻辑：文件版本戳更新就**整包替换**本机内容 —— 首屏快照缺页时，
          「更新完刷新一下」就少一个栏目，接着这台设备再推一次，云端也少；
       ③ 没有删除墓碑：分不清「这一页被删了」和「对方根本不知道这一页」。
     现在：页面按 id 做并集；只有**墓碑比该页最后一次改动还新**才算真删除。
     墓碑写进 content.config.collab.tomb = { 页id: 删除时刻 }，随内容一起同步。 */
  function tombOf(c) {
    try {
      const t = (((c || {}).config || {}).collab || {}).tomb;
      return (t && typeof t === 'object') ? t : {};
    } catch (e) { return {}; }
  }
  function mergeTomb(a, b2) {
    const out = {};
    [a || {}, b2 || {}].forEach(function (o) {
      Object.keys(o).forEach(function (k) {
        const v = +o[k] || 0;
        if (v > (out[k] || 0)) out[k] = v;
      });
    });
    /* 上限 300 条：最老的先剔除（删除记录只需要「比对方那份新」就够用，不需要永久保存） */
    const ks = Object.keys(out);
    if (ks.length > 300) {
      ks.sort(function (x, y) { return out[x] - out[y]; })
        .slice(0, ks.length - 300).forEach(function (k) { delete out[k]; });
    }
    return out;
  }
  /* 页面的「最后改动时刻」= 页自身 _ts 与块里最大的 _ts（用来和墓碑比新旧） */
  function pageStamp(p) {
    if (!p) return 0;
    let t = +p._ts || 0;
    const bl = Array.isArray(p.blocks) ? p.blocks : [];
    for (let i = 0; i < bl.length; i++) {
      const b = bl[i];
      const x = +((b && b._ts) || 0), y = +((b && b._t) || 0);
      if (x > t) t = x;
      if (y > t) t = y;
    }
    return t;
  }
  /* 页级字段（标题 / 图标 / 父级 / 版式）三向合并 —— 只处理这些键，不碰 blocks。
     parent 尤其重要：它一旦被错误地改成别处（或指向已不存在的页），
     renderNav 的 `!p.parent` 过滤会让这个栏目**从导航里彻底消失**（数据还在、栏目看不见）。 */
  var PAGE_FIELDS = ['title', 'name', 'icon', 'desc', 'description', 'parent', 'kind', 'heroAlign', 'heroStyle', 'sort', 'order'];
  function mergePageFields(ap, bp, rp) {
    if (!ap || !bp || !rp) return;
    const nowT = Date.now();
    PAGE_FIELDS.forEach(function (k) {
      let A, B, R;
      try { A = JSON.stringify(ap[k]); B = JSON.stringify(bp[k]); R = JSON.stringify(rp[k]); } catch (e) { return; }
      if (B === R) return;                                                        /* 远端没动这个字段 */
      if (A === R) { try { rp[k] = bp[k]; } catch (e2) { /* noop */ } return; }    /* 只有本机动了 */
      if (A === B) return;                                                        /* 只有远端动了 → 保持远端 */
      const bt = Math.min(+bp._ts || 0, nowT), rt = Math.min(+rp._ts || 0, nowT);
      if (bt > rt) { try { rp[k] = bp[k]; } catch (e3) { /* noop */ } }
    });
    /* ★ 修复152：合并后的页要带一份「双方落款取大」（封顶到此刻，防未来戳外溢）。
       否则本机的字段赢了、页对象却还是远端那枚旧 _ts，下一次和删除墓碑比新旧就会判错
       （页面刚改过却因为戳旧被判成「删除前的回魂包」而消失）。
       两边都没有 _ts 时不写这个键 —— 免得凭空多出一个字段，让「内容没变」的判定失真。 */
    const mt = Math.max(+bp._ts || 0, +rp._ts || 0);
    if (mt > 0) { try { rp._ts = Math.min(mt, nowT); } catch (e4) { /* noop */ } }
  }
  /* 同一页：结构一致 → 字段级三向；结构变了 → 整页取远端（与旧版一致，但**页面本身不丢**） */
  function mergePageBlocks(bp, rp, staleP) {
    if (!bp || !rp || !Array.isArray(bp.blocks) || !Array.isArray(rp.blocks)) return;
    const anc = _base;
    const pid = rp.id || bp.id;
    const ap = (anc && Array.isArray(anc.pages)) ? anc.pages.filter(function (p) { return p && p.id === pid; })[0] : null;
    mergePageFields(ap, bp, rp);
    if (bp.blocks.length !== rp.blocks.length) {
      /* ★ 修复153：块没有 id，结构不同时只能「整页取远端」。但这份远端内容**不比本机新**
         （过期包 / 云端落后）时，整页取远端等于用旧页顶掉本机刚加的块 —— 所以改成**保留本机这一页**。
         新内容照旧（staleP=false）走整页取远端。 */
      /* ★ 修复162：再加一道「远端到底动没动过这一页」的判据 ——
         远端这页与共同祖先一模一样 = 远端没碰它，那结构差异只可能来自本机刚加的块，
         此时**保留本机**（旧写法会因为 staleP=false 用远端旧结构盖掉本机新增）。
         云端那页真的变了（17 块 vs 本机 6 块模板）才整页取远端。 */
      let remoteTouched = true;
      if (ap && Array.isArray(ap.blocks)) {
        try { remoteTouched = JSON.stringify(ap.blocks) !== JSON.stringify(rp.blocks); }
        catch (eRT) { remoteTouched = true; }
      }
      if (!staleP && remoteTouched) return;               /* 远端动过结构且不旧 → 取远端 */
      try { rp.blocks = JSON.parse(JSON.stringify(bp.blocks)); } catch (eSB) { /* noop */ }
      return;
    }
    const ancOk = !!(ap && Array.isArray(ap.blocks) && ap.blocks.length === rp.blocks.length);
    rp.blocks.forEach(function (rb, j) {
      const bb = bp.blocks[j];
      if (!bb || !rb) return;
      if (JSON.stringify(bb) === JSON.stringify(rb)) return;
      if (ancOk) { rp.blocks[j] = mergeBlockFields(ap.blocks[j], bb, rb); return; }  /* ★ 字段级 */
      const bt = +bb._ts || 0, rt = +rb._ts || 0;
      if (bt > rt) rp.blocks[j] = bb; /* 没有祖先：退回块级后写优先（旧规则） */
    });
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
        /* ★ 修复151：两边都改了 —— 长文本先试三向合并（两人在同一段的不同位置打字，两边都保住）；
           合不了（真的改在同一个字上）再按 _ts 后写优先 */
        let done = false;
        if (TEXT_FIELDS[k]) {
          const m = mergeText3(b0[k], l0[k], r0[k]);
          if (m != null) { v = m; done = true; }
        }
        if (!done) {
          /* 后写优先；未来时间戳按「此刻」算，避免时钟错的设备长期霸占同一字段 */
          const lt = Math.min(+l0._ts || 0, nowT), rt = Math.min(+r0._ts || 0, nowT);
          v = lt > rt ? l0[k] : r0[k];
        }
      }
      if (v === undefined) return;                   /* 两边都没这个字段 → 不写空键 */
      out[k] = v;
    });
    out._ts = Math.min(Math.max(+l0._ts || 0, +r0._ts || 0), nowT);   /* ★ 修复122：未来戳不外溢 */
    return out;
  }
  function mergeBlocks(c, staleP) {
    try {
      const base = window.LMApp ? LMApp.state.content : null;
      if (!base || !Array.isArray(base.pages) || !Array.isArray(c.pages)) return c;
      /* ① 墓碑并集（本机 + 远端）→ 写回远端内容，随内容继续同步 */
      const tomb = mergeTomb(tombOf(base), tombOf(c));
      try {
        const cfg = c.config = c.config || {};
        cfg.collab = cfg.collab || {};
        cfg.collab.tomb = tomb;
      } catch (eT) { /* 写不进去也不影响下面的合并 */ }
      /* ★ 修复159：界面开关（config.ui，例如 hideAsk）不能被「另一台设备的老内容包」整包顶掉。
         开关只存在 config.ui 里，而远端包一旦带着自己的 config 回来就会整块覆盖它 ——
         对方没升级过、或它本地那份内容还是「加开关之前」的，管理员刚勾上的开关就会莫名失效。
         规则：本机有的键先保底，远端**明确写了**的键以远端为准（取消勾选会显式写 false，
         所以「把开关关掉」这件事照样传得过来）。 */
      try {
        const cfgU = c.config = c.config || {};
        const lu = (((base || {}).config || {}).ui) || {};
        const ru = (cfgU.ui && typeof cfgU.ui === 'object') ? cfgU.ui : {};
        const nu = {};
        Object.keys(lu).forEach(function (k) { nu[k] = lu[k]; });
        Object.keys(ru).forEach(function (k) { nu[k] = ru[k]; });
        cfgU.ui = nu;
      } catch (eU) { /* noop */ }
      /* ② 远端每一页：与本机同 id 的那一页做块级 / 字段级合并 */
      const localById = {};
      base.pages.forEach(function (p) { if (p && p.id) localById[p.id] = p; });
      c.pages.forEach(function (rp) { if (rp && rp.id && localById[rp.id]) mergePageBlocks(localById[rp.id], rp, !!staleP); });
      /* ③ 有墓碑且墓碑比远端那页还新 → 远端这份是「删除前的回魂包」，去掉 */
      const kept = c.pages.filter(function (p) {
        if (!p || !p.id) return true;
        const ts = +tomb[p.id] || 0;
        return !(ts && ts > pageStamp(p));
      });
      /* ④ 本机有、远端没有的页 —— 只有「确实删过」才认删，否则并回去（这是丢栏目的主修复） */
      const inRemote = {}, have = {};
      c.pages.forEach(function (p) { if (p && p.id) inRemote[p.id] = 1; });
      kept.forEach(function (p) { if (p && p.id) have[p.id] = 1; });
      const extra = [];
      base.pages.forEach(function (p) {
        if (!p || !p.id || inRemote[p.id] || have[p.id]) return;
        const ts = +tomb[p.id] || 0;
        if (ts && ts > pageStamp(p)) return;                 /* 本机也确认删过了 */
        extra.push(JSON.parse(JSON.stringify(p)));           /* 深拷贝：别把本机对象塞进远端包 */
      });
      if (extra.length) {
        const idxOf = function (arr, id) {
          for (let i = 0; i < arr.length; i++) if (arr[i] && arr[i].id === id) return i;
          return -1;
        };
        extra.forEach(function (p) {
          const li = idxOf(base.pages, p.id);
          let at = li >= 0 ? Math.min(li, kept.length) : kept.length;
          /* 紧跟在本机顺序里它前面那个「还在」的页之后，尽量保持栏目顺序 */
          for (let k = li - 1; k >= 0; k--) {
            const j = idxOf(kept, base.pages[k] && base.pages[k].id);
            if (j >= 0) { at = j + 1; break; }
          }
          kept.splice(at, 0, p);
        });
      }
      c.pages = kept;
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
  function doApply(c, ts, by, staleP) {
    bump(ts);
    /* 讨论区保护：远端整包覆盖前，把本机还没广播出去的新发言并进去（id 并集 + 墓碑），防止丢评论 */
    try {
      if (window.LMCommunity && window.LMApp && Array.isArray(LMApp.state.content && LMApp.state.content.discuss)) {
        c.discuss = window.LMCommunity.merge(c.discuss || [], LMApp.state.content.discuss);
      }
    } catch (e0) { /* noop */ }
    rosterFromRemote(c);           /* 设备名单双向可见 */
    c = mergeBlocks(c, !!staleP);  /* 字段级三向合并（见上方注释；无祖先时退回块级后写优先）
                                      ★ 修复153：staleP → 结构冲突时保留本机页（不拿旧页顶掉本机新块） */
    const before = LMApp.state.content;
    let same = false;              /* 内容一模一样（重复帧 / 别人保存但没改东西）→ 不重绘不提示：
                                      协作模式下对方每次保存不再引发本机整页重绘，这是“开协作就卡”的主因之一 */
    try { same = JSON.stringify(before) === JSON.stringify(c); } catch (e5) { /* noop */ }
    if (same) return;
    structConflictWarn(c, by); /* ★ 修复88：被整页覆盖前先提醒一句（见函数注释） */
    try { LMApp.applyRemoteContent(c); } catch (e) { return; }
    noteBase(c);   /* ★ 修复121：真正应用成功后才推进共同祖先（被挂起的包不能推进） */
    /* ★ 修复152：远端内容必须立刻落盘。旧版只改了内存里的 state.content，靠 app.js 那个 20 秒的
       自动保存兜底 —— 这 20 秒内刷新 / 关页面（课堂上很常见），刚同步来的内容就白同步了，
       而且下次打开还是旧内容，旧内容又会照 v149 的路径推回云端。 */
    try { if (window.LMStore && LMStore.saveLocal) LMStore.saveLocal(LMApp.state.content); } catch (eS0) { /* 落盘失败：内存已生效，20 秒自动保存会再试 */ }
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
  /* ★ 修复152：一个包「真实的版本」= max(消息时刻, 内容里的 syncTs)。
     为什么要取 max：`send()` 会把 msg.ts 覆盖成**发送方的墙上时钟**，而内容里的 syncTs 是发布时
     用 nextSyncTs() 发的号（可能比墙上时钟更大 —— _pubTs 被对端更大的戳抬高过）。
     旧版只按 msg.ts 判过期：对端时钟慢几十秒时，它的**每一包** msg.ts 都 <= 本机 lastTs，
     于是它在自己那边改什么都传不过来（现场＝「我这边看得到他在打字，字就是不出现」）。
     取 max 之后：新内容不会被误丢，真正旧的包（内容和 msg 都旧）照旧丢弃。 */
  function packetTs(msgTs, contentTs) {
    const a = +msgTs || 0, b = +contentTs || 0;
    return a > b ? a : b;
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
      if (v.repaired) {
        c = v.content;
        try { console.warn('[协同·坏包] 远端内容缺字段，已按规则补齐后应用（缺 blocks / 缺页面 id 之类），本机不受影响'); } catch (eW1) { /* noop */ }
      }
    }
    /* ★ 修复72：force = Yjs 网状通道专用。Y.Doc 本身就只给出「更新的整包」（因果有序），
       不该再拿墙上时钟挡一道 —— 任一端时钟快一点，更新就被静默丢掉，
       表现正是「徽标上看得到有人在编辑，内容却怎么都不同步」 */
    /* ★ 修复152：判过期用 packetTs（消息时刻与内容版本戳取大者），不再只看 msg.ts —— 见函数注释 */
    /* ★ 修复153（「电脑改了五分钟，手机还没同步」的第二真凶 —— 也是最后一道丢包闸门）：
       这里原来是**硬丢弃**：`pts <= lastTs` 直接 return false。而 pts 永远是对方按自己的时钟/版本
       发出来的号：只要本机时钟快过对方（几分钟很常见），对方的每一包都 <= 本机 lastTs，
       于是「他改他的，我这边一个字都不进来」，直到本机时钟追上 —— 恰好就是「五分钟」的体感。
       现在改成：**不丢包**。理由很硬 —— 合并本身是按块级 / 页级 `_ts` 的后写优先（旧包压不掉新内容），
       页有并集 + 墓碑，内容真的一模一样时 doApply 会自己 JSON 比对后提前 return（不重绘、不弹提示）。
       同时把「未来戳」夹到此刻 +60 秒，避免它再被 bump 进 lastTs/_pubTs 里继续放大时间差。 */
    const nowT = Date.now();
    const pts = Math.min(packetTs(msg.ts, (((c.config || {}).collab || {}).syncTs || 0)), nowT + 60000);
    const staleP = !msg.force && pts <= lastTs;   /* 版本不占优（但仍要合并：见上面注释） */
    if (staleP) warnStale(pts);                   /* 只留诊断（5 秒一条），不再 return false */
    if (localBusy()) {
      /* ★ 修复152：挂起包只保留「更新的那一个」。旧版无条件覆盖 —— 拖着块/正在输入时先后到的两个包，
         后到的**旧包**会把先到的新包顶掉，松手只应用旧包，新内容要等对方再动一次才来。 */
      if (!pending || pts >= (+pending.ts || 0)) pending = { content: c, ts: pts, by: msg.name, stale: staleP };
      return false;
    }
    if (verifyBanList(c)) { doApply(c, pts, msg.name, staleP); return true; } /* 管理员设备会核对屏蔽名单签名，坏条目剔除后再用 */
    return false;
  }
  function flushPending() {
    if (!pending || localBusy()) return false;
    const p = pending; pending = null;
    if (verifyBanList(p.content)) { doApply(p.content, p.ts, p.by, p.stale); return true; }   /* ★ 修复153：把「是否过期」带过去 */
    return false;
  }
  function recv(msg) {
    if (!msg || msg.t !== 'lm1' || !window.LMApp) return;
    if (msg.from === me.id) return; /* 服务器会把消息回发给发送者自己，过滤 */
    try { rosterTouch(msg.from, msg.name, msg.fp, msg.page); } catch (eR) { /* 脏数据不拖垮消息处理 */ }
    try {
      switch (msg.type) {
      case 'hello':
        /* ★ 修复152：多记一个「本机收到时刻」—— peers 的过期判定必须用本机时钟。
           旧版用 msg.ts（发送方的墙上时钟）：对端时钟慢 30 秒时，它的 iam 一进来就已经
           「超过 PEER_TTL」，sweep 每 6 秒把它删掉又从下一个 iam 加回来 → 对面不停弹
           「已断线 / 又回来了」，面板和徽章的台数也跟着跳。 */
        peers[msg.from] = { name: msg.name, fp: msg.fp, ts: msg.ts, page: msg.page, seenAt: Date.now() };
        clearLeft(msg.from); /* 回来了：清掉「已退出页面」的短暂屏蔽 */
        if (msg.want) { /* 新设备要全量：只让「设备号最小」的那台回，避免多台同时灌 */
          const ids = Object.keys(peers).concat([me.id]).sort();
          if (ids[0] === me.id && validContent(LMApp.state.content)) send({ type: 'state', to: msg.from, content: LMApp.state.content });
        }
        presenceTick(); break;
      case 'iam':
        peers[msg.from] = { name: msg.name, fp: msg.fp, ts: msg.ts, page: msg.page, seenAt: Date.now() };   /* ★ 修复152：同 hello */
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
  /* 场上是否「不止我这一台」：Yjs awareness / 旧通道设备状态机 / 云端刚变过 / 花名册 任一判断出来就算 */
  function peersHot() {
    try {
      if (liveCount() > 1 || yPeerCount() > 0) return true;
      /* ★ 修复142（这是「内容还是不能及时同步」最主要的环节）：跨网络的 presence **根本出不了本机** ——
          ① GH 通道只转发 type==='commit'（hello/iam 被直接丢掉，见 ghInit 的 transport）；
          ② BroadcastChannel 只覆盖「同一个浏览器」；
          ③ Yjs 的 awareness 只有 WebRTC 真连上才有（只剩 MQTT 信令时 peerCount 恒为 0）。
        于是 liveCount() 永远是 1 → peersHot() 永远 false → 两台设备一直在跑慢节拍（旧值 6s 推 / 8s 拉）。
        这里补两条「跨设备也成立」的间接证据，让快节拍真正生效：
          ① GH.lastPullAt：云端 2 分钟内变过 = 刚刚有人在别的设备保存并推送；
          ② content.config.collab.roster：花名册里 2 分钟内在线的其他设备（随内容同步，跨网络可见）。 */
      if (GH.lastPullAt && Date.now() - GH.lastPullAt < 120000) return true;
      const r = roster(), now = Date.now();
      return Object.keys(r).some(function (k) {
        const o = r[k];
        return !!o && k !== me.id && now - (+o.lastSeen || 0) < 120000;
      });
    } catch (e) { return false; }
  }
  /* GitHub 轮询间隔：隐藏 20s；前台且在活动（30 秒内动过）→ 1s / 有人在线 0.8s；
     前台但闲置 → 2s / 有人在线 1s（★ 修复150：整体再收紧一档） */
  function pollGapNow(hidden, act, hot) {
    if (hidden) return POLL_HIDDEN;
    if (act) return hot ? HOT_ACTIVE : POLL_ACTIVE;
    return hot ? HOT_IDLE : POLL_IDLE;
  }
  /* 访客只读轮询间隔：前台 4s、后台 45s（★ 修复150） */
  function visitorGapNow(hidden) { return hidden ? POLL_VISITOR : VISITOR_SHOWN; }
  /* 推送最小间隔：有人在线 0.8s（★ 修复150，旧 1.5s）—— 这是跨网络协同「慢半拍」的最大单项 */
  function pushWaitMin(hot) { return hot ? HOT_PUSH_MIN : GH_PUSH_MIN; }
  /* ★ 修复150：退出键入 / 切后台这类「立刻发」的等待 = 硬底 400ms − 距上次推送已过的时间（纯函数，可单测）。
     刚推过 100ms 又退出键入 → 只等剩下的 300ms；早就推过 → 0（立刻发）。
     「等」不等于「丢」：被挡下的这一笔由 wantPush() 记账 + kickPush() 补推接住。 */
  function flushWaitMin(now, lastPush) { return Math.max(FLUSH_HARD_MIN - ((+now || 0) - (+lastPush || 0)), 0); }
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
    /* ★ 修复153：把「本机这一笔还没上云」直接写在胶囊上 —— 以前这种情况完全静默
       （现场＝「我改了五分钟，对方一点动静都没有」），现在一眼看到「⚠ 未上传 87 秒」+ 胶囊转橙，
       就知道不是对方的问题，而是这一笔卡在本机（限流退避 / Token 失效 / 云端不可用）。 */
    const stuckSec = (function () {   /* ★ 修复153：TDZ 安全（paintChip 可能在 GH 初始化前被调用） */
      try { return (GH.dirty && GH.dirtyAt) ? Math.round((Date.now() - GH.dirtyAt) / 1000) : 0; }
      catch (eG) { return 0; }
    })();
    const stuck = stuckSec > 45;
    const txt = '<span class="dot' + (lost || stuck ? ' warn' : '') + '"></span>协作中 · ' + n + ' 台设备'
      + (lost ? '（' + lost + ' 台已断线）' : '')
      + (stuck ? '（⚠ 未上传 ' + stuckSec + ' 秒）' : '')
      + '（' + modeLabel + yChannelLabel() + '）';
    if (chip.innerHTML !== txt) chip.innerHTML = txt; /* ★ 修复73：2 秒一拍也不重复重排 DOM */
    if (chip.classList.contains('stuck') !== stuck) chip.classList.toggle('stuck', stuck);
    chip.title = '我：' + me.name + '（#' + shortId(me.id) + '）— 点开看在线 / 断线设备'
      + (stuck ? '｜本机有改动还没上传：' + stuckSec + ' 秒' : '');
    /* ★ 修复153：胶囊宽度会随台数/模式变化 → 正贴着的提示条要重新贴合，别被胶囊压住 */
    try { if (window.LMApp && LMApp.reposeToast) LMApp.reposeToast(); } catch (eRp) { /* noop */ }
  }
  function renderPanel() {
    let pan = document.getElementById(PANEL_ID);
    if (!pan) {
      pan = document.createElement('div'); pan.id = PANEL_ID;
      document.body.appendChild(pan);
      pan.addEventListener('click', function (e) {
        if (e.target === pan) { pan.classList.remove('show'); return; }
        /* ★ 修复153：「🔄 立即同步」用事件委托（面板内容会被 2 秒一拍重绘，绑在按钮上会丢） */
        const b = (e.target && e.target.closest) ? e.target.closest('[data-sync]') : null;
        if (b) { forceSync(); }
      });
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
    /* ★ 修复153：底部一栏「云端同步卡在哪一步 + 一键重试」——
       手机上看不出「为什么五分钟都没同步」时，点开胶囊就能看到：待上传多久 / 限流退避多久 /
       是不是回退到了 main / 上次云端更新是几秒前，再点「🔄 立即同步」把退避和缓存全清掉重来。 */
    html += '<div class="cp-sync"><span>' + escHtml(syncLine()) + '</span>'
      + '<button type="button" class="cp-btn" data-sync="1">🔄 立即同步</button></div>';
    html += admin
      ? '<div class="cp-note">改名 / 查看全部设备 / 屏蔽管理：右上角 ⚙ 设置 → 协作与设备</div>'
      : '<div class="cp-note">设备昵称由管理员在 ⚙ 设置里统一管理（同昵称多设备允许，靠设备号区分）</div>';
    if (pan.innerHTML !== html) pan.innerHTML = html; /* ★ 修复73：2 秒定时重绘不闪烁 */
    pan.classList.add('show');
  }
  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  /* ★ 修复153：云端同步「卡在哪一步」的一句话摘要（面板/诊断共用，手机上看一眼就懂） */
  function syncLine() {
    try {
      if (!GH.cfg || !GH.cfg.owner || !GH.cfg.repo) {
        return GH.token ? '云端：未配置仓库（点「☁ 同步」绑定）' : '云端：未接入（只有本机互连通道）';
      }
      if (!GH.token) {   /* 访客：只读轮询 */
        const s = GH.lastPullAt ? Math.round((Date.now() - GH.lastPullAt) / 1000) : -1;
        return '云端只读：' + (s < 0 ? '还没取到内容' : (s < 3 ? '刚刚更新过' : '上次更新 ' + s + ' 秒前'))
          + (GH.useMain ? '（已回退 main）' : '');
      }
      const bits = [];
      if (GH.dirty) bits.push('待上传 ' + Math.round((Date.now() - (GH.dirtyAt || Date.now())) / 1000) + ' 秒');
      if (GH.blockUntil > Date.now()) bits.push('限流退避 ' + Math.round((GH.blockUntil - Date.now()) / 1000) + ' 秒');
      if (GH.useMain) bits.push('已回退 main');
      if (GH.pushBusy) bits.push('正在上传');
      const lp = GH.lastPullAt ? Math.round((Date.now() - GH.lastPullAt) / 1000) : -1;
      if (lp >= 0) bits.push('云端 ' + (lp < 3 ? '刚刚' : lp + ' 秒前') + ' 变过');
      return '云端：' + (bits.length ? bits.join(' · ') : '已同步');
    } catch (e) { return '云端：状态未知'; }
  }
  /* ★ 修复153：一键「重新核对 + 立刻同步」—— 手动清掉所有会卡住同步的粘性状态：
     限流退避（403/429 最长会挡 5 分钟）、回退 main、ETag/sha/已合并戳缓存、在飞锁。
     然后先拉一次（拉完自动补推），本机脏内容交给 kickPush 补发；控制台 LMCollab.forceSync() 同效。 */
  function forceSync() {
    GH.blockUntil = 0; GH.useMain = false; GH.etag = ''; GH.mergedTs = 0;
    GH.inFlight = false; GH.inFlightAt = 0; GH.pushBusy = false; GH.pushBusyAt = 0;
    GH.pulledOnce = false; GH.coldAt = 0; GH.timer = 0; GH._409T = 0;
    GH.pullErr = null; GH.cloudMissing = false; GH.guardAt = 0;   /* ★ 修复161：手动「重新核对」从干净状态开始 */
    try { Object.keys(shaOf).forEach(function (k) { delete shaOf[k]; }); } catch (e0) { /* noop */ }
    try { Object.keys(baseShaOf).forEach(function (k) { delete baseShaOf[k]; }); } catch (e0b) { /* noop */ }
    try { if (window.LMApp) LMApp.toast('🔄 正在重新核对云端版本…'); } catch (e1) { /* noop */ }
    try { ghPull(); } catch (e2) { /* noop */ }
    if (GH.token) { wantPush(); kickPush(1500); }   /* 有写权限才记账：访客没有东西要上传 */
    try { paintChip(); } catch (e3) { /* noop */ }
    return true;
  }
  function sweep() {
    try {
      const now = Date.now();
      Object.keys(locks).forEach(function (k) {
        if (now - locks[k].ts > LOCK_TTL) { delete locks[k]; delete coEdit[k]; repaintLocks(); }
      });
      Object.keys(peers).forEach(function (k) { if (now - (+(peers[k].seenAt || peers[k].ts) || 0) > PEER_TTL) delete peers[k]; });   /* ★ 修复152：用本机接收时刻判过期（对端时钟慢不再被反复踢出） */
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
  /* ★ 修复140：publish 的版本戳单调递增 —— 「同一毫秒里连写两笔」不会撞号。
     flushPush 用 syncTs 与「已推上去的版本戳」比对做快速去重（省一次全量序列化），
     撞号就会把第二笔误判成「已经推过」而不推，所以这里必须保证唯一。 */
  var _pubTs = 0;
  function nextSyncTs() {
    const t = Date.now();
    _pubTs = t > _pubTs ? t : _pubTs + 1;
    return _pubTs;
  }
  function publish(content) {
    if (!validContent(content)) return;
    const ts = nextSyncTs();
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
    /* ★ 修复152：用户又改了一笔 → 清掉「连续补推放慢」的计数。
       否则断网/额度受限连着失败 6 次后，kickPush 会退避到 15 秒；网络恢复后第一笔仍要干等 15 秒
       （现场＝「网好了还要半天才同步」）。用户主动编辑时值得立刻再试一次。 */
    try { GH.kickN = 0; } catch (eKN) { /* noop */ }
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
               lastPullAt: 0,       /* ★ 修复142：上一次「云端真的变过」的本机时刻（peersHot 的跨设备证据） */
               useMain: false,      /* 已回退到 main（本页会话内有效） */
               snapAt: 0,           /* 上次写 main 快照的时刻 */
               blockUntil: 0,       /* ★ 修复90：限流/退避到期时刻，到期前一律不写（越撞越死） */
               rateLeft: null,      /* ★ 修复90：X-RateLimit-Remaining 观测值 */
               lastText: '',        /* ★ 修复90：上次成功推送的文件文本，内容没变就不重复 PUT */
               syncedText: '',      /* ★ 修复153：「上一次和云端对齐时的原文」（拉取成功记云端那版、推送成功记已推文本）。
                                        flushPush 靠它判断「本机还有没有东西要推」——按 syncTs 比大小会被
                                        mergeBlocks 改写 syncTs 的副作用骗过去（见 flushPush 注释） */
               mergedTs: 0,         /* ★ 修复105：已按块级合并过的云端版本戳（同一份不反复合并） */
               pulledOnce: false,   /* ★ 修复149：本页会话里「至少成功跟云端对过一次话」（拉取落地/304）。
                                       为 false 时一律不许推 —— 否则刚打开的旧标签页会把云端内容倒退 */
               coldAt: 0,           /* ★ 修复149：冷启动起点（15 秒还拉不到就放行，别让用户永久推不上去） */
               /* ★ 修复140（「退出键入五分钟对方都没反应」的根因）：推送与轮询拉取原来共用 GH.inFlight
                  一把锁 —— 拉取（每 1.2–8 秒一次，且要等网络往返）期间到来的 commit 全被
                  `if (GH.inFlight) return;` **静默丢弃**：既不重试也不记账，于是「退出键入」那一笔
                  就永远留在本机，直到用户再改一次才可能顺带发出去。现在拆成两把锁 + 脏标记 + 补推定时器。 */
               pushBusy: false,     /* 推送独占锁（不再复用拉取的 inFlight，两边互不吞请求） */
               pushBusyAt: 0,       /* 推送开始时刻（60 秒看门狗，与 inFlightStale 同款） */
               dirty: false,        /* 有「还没成功上云」的内容：任何原因没发出去都不丢 */
               dirtyAt: 0,          /* 记账时刻（诊断里显示「待推送多少秒」） */
               kickT: 0,            /* 补推定时器（单条去重） */
               kickN: 0,            /* 连续补推次数（连败就放慢，别把定时器转成电老虎） */
               flushAsap: false,    /* 本次推送跳过最小间隔（退出键入 / 切后台 / 关页面） */
               lastPushTs: 0,       /* 上次成功推送的内容版本戳（syncTs）：相同的直接跳过，省一次全量序列化 */
               pullErr: null,       /* ★ 修复161：上一次拉取的失败原因 {at,msg} —— 手动上传据此判断「该不该放行」 */
               cloudMissing: false, /* ★ 修复161：云端还没有这份内容（404）→ 首次上传自动创建，不算「没核对上」 */
               guardAt: 0,          /* ★ 修复161：手动上传被拦的起点（有界等待 ≤6 秒，绝不永久锁死） */
               _mk: null };         /* 建数据分支的进行中 Promise（去重） */
  const shaOf = {};                  /* 分支 → 该文件 blob sha（乐观锁缓存，按分支分开） */
  /* ★ 修复162：分支 →「本机这一版内容是**基于**云端哪个 sha」。
     旧写法在推之前用 getSha() 取**最新** sha 再带上，等于先问「现在云端是哪一版」再拿它当锁——
     锁永远对得上，所以任何一台停在旧内容上的设备都能整包覆盖别人刚写的东西（2026-11-09 三张地图被写回模板）。
     现在只认「我读到的那一版」：云端若已被别人推过，PUT 会 409，走既有的「先拉取→块级合并→再推」路径。 */
  const baseShaOf = {};
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
  /* ★ 修复140：脏标记也落一份到本机 —— 关页面 / 崩溃时若还有一笔没推上去，下次打开自动补推 */
  const DIRTY_KEY = 'lm_gh_dirty_v1';
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
  /* ★ 修复142：记下「云端版本戳 / 云端刚变过」两件事 ——
     ① GH.lastPullAt 给 peersHot() 当「场上还有别人」的跨设备证据（见 peersHot 注释）；
     ② 版本戳**封顶到现在**：对端时钟快 30 秒时它推来的 ts 会比本机时间还大，
        旧代码原样存进 GH.lastPullTs，于是 `GH.lastPullTs > myTs` 把本机之后的每一笔推送都吃掉；
     ③ 顺手把本机发号器顶上去，保证下一次 publish 的戳一定比云端那份新。 */
  function notePulled(ts) {
    GH.lastPullAt = Date.now();
    const t = Math.min(+ts || 0, Date.now() + 1000);
    if (t > GH.lastPullTs) GH.lastPullTs = t;
    if (t > _pubTs) _pubTs = t;
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
      if (r.status === 304) { GH.pulledOnce = true; return null; } /* 云端没变化（且不耗额度）；★ 修复149：也算「对过话」 */
      /* ★ 修复90：访客只读。若数据分支还不存在（管理员尚未落库成功 / Token 无建分支权限），
         改读发布分支 —— 内容一定在那里；否则访客会永远停在首屏快照上看不到更新 */
      if (r.status === 404 && !useApi && !GH.useMain && ghDataRef() !== ghMainRef()) {
        GH.useMain = true; GH.etag = ''; GH.timer = 0;
        GH.inFlight = false;
        GH.pulledOnce = false;   /* ★ 修复149：刚换分支，还没读到 main —— 40ms 后那一次拉取才算「对过话」 */
        GH._swapRetry = true;    /* ★ 修复152：这一轮不算「拿到云端内容」—— 否则下面那行会把
                                    pulledOnce 又置真，冷启动闸门在「数据分支还不存在」这个最该拦的
                                    场景下正好失效（旧标签页一 focusout 就把首屏旧内容写上去） */
        setTimeout(ghPull, 40);
        return null;
      }
      /* ★ 修复161：数据分支 / 内容文件**还不存在**（第一次落库、分支被删、Private 仓库无权限
         也会返回 404）≠「没核对上」。旧版这里直接 throw → pulledOnce 永远是 false →
         手动上传被永久拦死（用户现场：「一直显示在核对云端版本，死活不上传」）。
         云端既然没有内容可丢，就该放行：下面 ghPush 的 ensureDataBranch + PUT 会把文件建出来。
         真没权限的话 PUT 会明确报错，用户看到的是真实原因，而不是永远转圈。 */
      if (r.status === 404) {
        GH.pulledOnce = true; GH.cloudMissing = true; GH.pullErr = null;
        /* ★ 修复162：云端没有文件 → 没有「基准版本」，首次上传走「不带 sha 直接建文件」 */
        delete baseShaOf[ref];
        return null;
      }
      if (!r.ok) throw new Error('http ' + r.status + (ref ? '（' + ref + '）' : ''));
      if (useApi) { const et = r.headers.get('etag'); if (et) GH.etag = et; }
      return r.json().then(function (j) {
        if (useApi) { shaOf[ref] = j.sha; baseShaOf[ref] = j.sha; return parseFileText(atobUh(j.content)); }
        return parseFileText(j);
      });
    }).then(function (c) {
      GH.inFlight = false;
      GH.pullErr = null;   /* ★ 修复161：这一轮通了 —— 上一轮的失败原因作废（手动上传据此放行） */
      /* ★ 修复152：刚做过「数据分支不存在 → 改读 main」的切换，这一轮没有任何内容到手，不算「对过话」 */
      if (GH._swapRetry) { GH._swapRetry = false; return; }
      GH.pulledOnce = true;   /* ★ 修复149：云端内容已到手（哪怕解析失败/是旧版）—— 现在允许推送了 */
      if (!validContent(c)) return;
      /* ★ 修复153：先记下「云端那一版的原文」（**合并之前**）—— flushPush 用它判断
         「本机内容是否已经和云端对齐」，比按 syncTs 比大小可靠（合并会把 syncTs 改成云端那一版）。 */
      let cloudText = '';
      try { cloudText = window.LMStore ? LMStore.buildFileText(c) : ''; } catch (eCT) { cloudText = ''; }
      const ts = +(((c.config || {}).collab || {}).syncTs || 0) || 1;
      const stale = (ts <= lastTs || ts <= GH.lastPullTs);
      if (!stale) {
        notePulled(ts);   /* ★ 修复142：版本戳封顶 + 记账「云端刚变过」+ 抬高本机发号器 */
        /* ★ 修复162：本机还有「没推上去的改动」时，不能整包采纳云端 —— 那会把本机刚敲的字冲掉。
           先做块级合并（两边都保住）；结构不同（比如本机还是旧的 6 块模板、云端已是 17 块）时
           由 mergePageBlocks 判「远端动没动过这一页」，动过就以远端为准。
           这里必须传 staleP=false：云端已经确认更新，结构冲突就该让更新的那份说话。 */
        let cc = c;
        if (GH.dirty) {
          try { cc = mergeBlocks(JSON.parse(JSON.stringify(c)), false); } catch (eM3) { cc = c; }
        }
        if (applyRemote({ content: cc, ts: ts, name: '云端（GitHub）' })) { if (cloudText) GH.syncedText = cloudText; }
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
        try { merged = mergeBlocks(JSON.parse(JSON.stringify(c)), true); } catch (eM0) { return; }   /* ★ 修复153：走到这里说明云端不比本机新 → 结构冲突保留本机页 */
        let sameM = false;
        try { sameM = JSON.stringify(merged) === JSON.stringify(LMApp.state.content); } catch (eS1) { sameM = false; }
        if (sameM) { GH.mergedTs = ts; return; }        /* 合并后没有实质变化：记账后不再重算 */
        try {
          LMApp.applyRemoteContent(merged);
          if (window.LMStore) LMStore.saveLocal(LMApp.state.content);
          GH.mergedTs = ts;
          /* ★ 修复153：云端「有」的仍是 cloudText（本机合进去的那些改动还没有上云）——
             记下来，flushPush 一比对就知道还欠一次推送，不会再误判成「没东西可推」 */
          if (cloudText) GH.syncedText = cloudText;
          /* ★ 修复142：合并应用成功 = 云端这一版已吃进来 → lastTs / 发号器一起顶到它之上，
             下一笔本机保存的戳必比云端新，不会再被 `GH.lastPullTs > myTs` 改道成「只拉不发」 */
          notePulled(ts); bump(ts);
        } catch (eD0) { return; }
        setTimeout(function () { repaintLocks(); enforceBans(); }, 60);
        LMApp.toast('🔄 已吸收「云端（GitHub）」另一台设备的修改');
        return;
      }
      /* ★ 修复152（访客路径的「每 4 秒重复应用一次」）：
         旧版只比「云端原文 vs 本机」，但**合并结果本来就会和云端原文不同**（本机多一页 / 本机有更晚的块），
         于是每一轮轮询都重新 apply 一遍：弹一次「🔄 已同步」、落一次盘、还往撤销栈压一帧
         （visitorGapNow 前台 4 秒一轮 = 每分钟 15 次；用户感受是「一直在同步，撤销还退不动」）。
         现在与管理员路径用同一套判据：同一份云端版本只合并一次；合并后和本机一模一样就什么都不做。 */
      if (GH.mergedTs === ts) return;
      try { if (JSON.stringify(c) === JSON.stringify(LMApp.state.content)) { GH.mergedTs = ts; return; } } catch (eC) { return; }
      if (localBusy() || !verifyBanList(c)) return;
      let merged = null;
      try { merged = mergeBlocks(c, true); } catch (eM2) { return; }   /* ★ 修复153：云端不占优 → 结构冲突保留本机页 */
      let sameM = false;
      try { sameM = JSON.stringify(merged) === JSON.stringify(LMApp.state.content); } catch (eS2) { sameM = false; }
      if (sameM) { GH.mergedTs = ts; return; }     /* 合并后没有实质变化：记账后不再重算 */
      try {
        LMApp.applyRemoteContent(merged);
        noteBase(LMApp.state.content);   /* ★ 修复121：应用后本机内容即新的共同祖先（与 doApply 保持一致） */
        if (window.LMStore) LMStore.saveLocal(LMApp.state.content);
        GH.mergedTs = ts;
        if (cloudText) GH.syncedText = cloudText;   /* ★ 修复153：云端那一版记下来（同管理员路径） */
        notePulled(ts); bump(ts);        /* ★ 修复142：同上 —— 吃进来的版本要顶到发号器之上 */
      } catch (eD) { return; }
      setTimeout(function () { repaintLocks(); enforceBans(); }, 60);
      LMApp.toast('🔄 已同步「云端（GitHub）」的修改');
    }).catch(function (e) {
      GH.inFlight = false;
      /* ★ 修复161：把「为什么没核对上」记下来 —— ① 手动上传靠它决定该不该放行；
         ② 用户/运维终于能看到原因（旧版吞掉所有错误，界面上永远只有一句「正在核对云端版本」） */
      const msg = (e && e.name === 'AbortError') ? '超时（15 秒没响应）'
        : String((e && e.message) || e || '网络错误');
      GH.pullErr = { at: Date.now(), msg: msg };
      try { console.warn('[协同·云端] 拉取失败：' + msg); } catch (eL) { /* noop */ }
    });
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
  /* ================= ★ 修复140：推送状态机（退出键入立刻发 · 永不丢最后一笔） =================
     背景（用户现场）：退出文本框以后对方「快五分钟都没反应」，而本地看起来一切正常。
     根因是 ghPush 里三条裸 return —— `if (GH.inFlight) return;` / `if (now < GH.blockUntil) return;` /
     防抖定时器以外的所有失败路径，**都不重试也不记账**。其中最致命的是第一条：GH.inFlight 是与
     轮询拉取共用的锁，拉取每 1.2–8 秒一次、每次要等一次网络往返，所以「退出键入」触发的那一笔
     有很大概率正好撞在拉取上 → 直接消失；而这一笔之后用户往往就不动了，对方于是永远看不到。
     处方：① 推送/拉取拆成两把锁；② 发不出去就记脏（GH.dirty）并挂补推定时器（kickPush）；
           ③ 退出键入 / 切后台 / 关页面走 flushPush，跳过防抖立刻发（仍守 700ms 硬底与限流退避）。 */

  /* ★ 修复149（「多设备还是不能实时更新」的真根因）：**别让旧标签页把云端推回旧版本**。
     现场证据（GitHub lm-data 分支的真实提交，syncTs 就是内容版本戳）：
        25e486a  07:28:57  syncTs=1793551011054   ← 00:43 的旧内容，云端被倒退 6.7 小时
        3ce16f7  08:21:26  syncTs=1793551011054   ← 又一次倒退 7.7 小时
        e669357  08:21:31  syncTs=1793578891773   ← 5 秒后才回到新鲜版本
      main 上的首屏快照同样被这锅旧内容写进去了（07:29:00 / 08:21:29 两次「内容快照」），
      于是之后每个新打开的页面都从旧内容起跑 —— 越滚越旧。
     成因：`document.focusout` 一响就 `flushPush`（修复140 为「退出键入立刻发」加的），
     而刚打开 / 刚刷新 / 刚被唤回的标签页，手里还是**首屏那份 data/content.js**，
     第一包云端内容还没拉回来（GH.lastPullTs 还是 0）→ 原来的 `GH.lastPullTs > myTs`
     守卫形同虚设 → 旧内容被当成「本机最新」写上去。另一台设备随即拉到这份"新提交的旧内容"，
     表现就是「内容不更新 / 改完又退回去 / 要等半分钟才跳一下」。
     判据（纯函数，可单测）：
       cold   —— 本页还没成功跟云端对过话：**先拉，别推**（不知道云端是哪一版，推了就可能倒退）
       behind —— 云端版本戳比本机新：先拉再推（本机落后，直接推 = 覆盖别人的新内容）
       ok     —— 可以推 */
  function pushColdGate(st) {
    st = st || {};
    if (!st.pulled) return 'cold';
    if ((+st.lastPullTs || 0) > (+st.myTs || 0)) return 'behind';
    return 'ok';
  }
  /* ★ 修复161 纯函数（可单测）：手动「☁ 同步到 GitHub」这一下要不要放行。
     返回 'allow' | 'block'。判据见 guardManualPush 里的现场说明 —— 一句话：
     **核对可以拦，但绝不能把用户永久锁死**（拉取失败时本机内容是唯一出路）。 */
  function manualGateDecide(st) {
    st = st || {};
    const now = +st.now || 0;
    const errWin = +st.errWindow || 15000;   /* 「刚才拉取明确失败」的有效期 */
    const flyWin = +st.flyWindow || 6000;    /* 一次拉取最多算「在飞」多久 */
    const maxWait = +st.maxWait || 6000;     /* 拦下的总时长上限 */
    if (st.why === 'ok') return 'allow';                                  /* 已核对且不落后 */
    if (st.pullErrAt && now - (+st.pullErrAt) < errWin) return 'allow';    /* 云端读不到 → 只能按本机传 */
    const flying = !!st.inFlight && (now - (+st.inFlightAt || now) < flyWin);
    if (!flying) return 'allow';                                          /* 没有拉取在飞 → 没什么可等 */
    if (st.guardAt && now - (+st.guardAt) > maxWait) return 'allow';       /* 已经拦太久 → 放行 */
    return 'block';
  }
  /* 纯函数（可单测）：这次 ghPush 该不该真的发 PUT？
     → { go, why, wait }，why = go / busy（上一笔还在飞）/ blocked（限流退避中）/ defer（防抖未到点）。
     ★ busy / blocked / defer 都**不是丢弃**，调用方必须 wantPush() 记账 + kickPush() 补推。 */
  function pushGate(st) {
    st = st || {};
    const now = +st.now || 0, bu = +st.blockUntil || 0;
    if (st.busy) return { go: false, why: 'busy', wait: 0 };
    if (bu && now < bu) return { go: false, why: 'blocked', wait: Math.min(Math.max(bu - now + 120, 300), 5000) };
    const wait = Math.max(+st.waitMin || 0, +st.rateGap || 0) - (now - (+st.lastPush || 0));
    if (wait > 0) return { go: false, why: 'defer', wait: wait };
    return { go: true, why: 'go', wait: 0 };
  }
  /* 脏标记：「这一笔还没上云」（同时落一份到本机，关页面/崩溃后下次打开自动补推） */
  function wantPush() {
    GH.dirty = true; GH.dirtyAt = Date.now();
    try { localStorage.setItem(DIRTY_KEY, '1'); } catch (eD) { /* noop */ }
  }
  function pushClean() {
    GH.dirty = false; GH.dirtyAt = 0; GH.kickN = 0;
    try { localStorage.removeItem(DIRTY_KEY); } catch (eD2) { /* noop */ }
  }
  function pushUnlock() { GH.pushBusy = false; GH.pushBusyAt = 0; }
  function latestContent() {
    try { return (window.LMApp && validContent(LMApp.state.content)) ? LMApp.state.content : null; }
    catch (e) { return null; }
  }
  /* 补推定时器（单条去重）。连续补推超过 KICK_SLOW 次就放慢到 15 秒 —— Token 失效 / 长期离线
     会一直失败，不能让它 5 秒一次空转到把手机电池啃掉 */
  var KICK_SLOW = 6;
  function kickPush(ms) {
    ms = Math.max(0, +ms || 0);
    if (GH.kickN >= KICK_SLOW) ms = Math.max(ms, 15000);
    if (GH.kickT) return;
    GH.kickT = setTimeout(function () {
      GH.kickT = 0;
      if (!GH.dirty) { GH.kickN = 0; return; }
      GH.kickN++;
      const c = latestContent();
      if (c) ghPush(c);
    }, ms);
  }
  /* 失败收尾：放锁 + 保留脏标记 + 指定时间后补推 */
  function pushFail(ms) { pushUnlock(); wantPush(); kickPush(ms); }
  /* 成功收尾：放锁；推的过程中内容又改了（脏还在）就立刻补推 —— 最后一笔永不丢 */
  function pushDone(okText) {
    pushUnlock();
    if (okText) {
      GH.syncedText = okText;   /* ★ 修复153：云端此刻这一份 = 刚推上去的原文（flushPush 的内容基线） */
      let same = false;
      try { const c = latestContent(); same = !!c && LMStore.buildFileText(c) === okText; } catch (e) { same = false; }
      if (same) pushClean();
    }
    if (GH.dirty) kickPush(120);
  }
  /* 推送看门狗（与拉取的 inFlightStale 同款，但各管各的锁） */
  function pushBusyStale() {
    if (!GH.pushBusy) { GH.pushBusyAt = 0; return false; }
    const now = Date.now();
    if (!GH.pushBusyAt) { GH.pushBusyAt = now; return false; }
    if (now - GH.pushBusyAt < 60000) return false;
    GH.pushBusy = false; GH.pushBusyAt = 0;
    try { console.warn('[协同·云端] 上一次推送 60 秒没返回，已强制复位推送锁（接下来会自动补推）'); } catch (e) { /* noop */ }
    return true;
  }
  /* 立刻推（退出键入 / 切后台 / 关页面）：跳过防抖，但守 700ms 硬底、限流退避与在飞锁；
     被挡下时不会丢 —— pushGate 的记账 + 补推会接住 */
  function flushPush(why) {
    if (!GH.cfg || !GH.token) return false;   /* 没有云端写通道：同浏览器 / 教室服务器通道本来就是即时广播 */
    const c = latestContent();
    if (!c) return false;
    /* ★ 修复153（「我电脑上改了，手机永远看不到」的第三条丢包路径）：判「有没有东西要推」必须比**内容**。
       旧守卫按 syncTs 比大小：`ts === lastPushTs` / `ts <= GH.lastPullTs` → pushClean() 直接跳过。
       而 applyRemote → mergeBlocks 会把本机的改动**合进「云端那个对象」**，本机内容的 syncTs 于是
       变成云端那一版（== GH.lastPullTs）—— 守卫误判成「这版已经推过了」，还顺手把脏标记清掉：
       本机的改动从此再也上不去云，直到用户**再改一次**（新 publish 才产生更大的戳）。
       现在改成与「上一次和云端对齐时的原文」逐字比对（GH.syncedText：拉取成功记云端原文、
       推送成功记已推文本），内容真的一样才跳过；不一样就一定推 —— 这才是「有没有东西要推」的正解。 */
    let sameText = false;
    try { sameText = !!GH.syncedText && !!LMStore && LMStore.buildFileText(c) === GH.syncedText; }
    catch (eSame) { sameText = false; }
    if (sameText) { pushClean(); return false; }
    GH.flushAsap = true;
    try { ghPush(c); } finally { GH.flushAsap = false; }
    try { GH.flushWhy = why || ''; } catch (eF) { /* noop */ }
    return true;
  }
  /* 「退出键入」类事件：先立刻发一次，再等编辑器把这次改动写进 state 后补两次
     （脚本顺序 editor.js 在 collab.js 之前，这里只是双保险；重复的那次被 lastText 去重，不烧额度） */
  function flushPushSoon(why) {
    if (!GH.cfg || !GH.token) return;
    try { flushPush(why); } catch (e1) { /* noop */ }
    setTimeout(function () { try { flushPush(why); } catch (e2) { /* noop */ } }, 0);
    setTimeout(function () { try { flushPush(why); } catch (e3) { /* noop */ } }, 320);
  }
  /* ★ 修复149：手动「☁ 同步到 GitHub」前的闸门 —— 手动同步同样是把本页手里的内容写进
     数据分支 + main 快照，所以同样不能「本页还落后」时上传：旧标签页点一下，云端就倒退
     几个小时（lm-data 上 07:28:57 与 08:21:26 两笔 syncTs 停在 00:43 就是这么写上去的）。
     返回 true = 已拦下（调用方不要再传）；false = 可以传。 */
  function guardManualPush() {
    if (!GH.cfg || !GH.token) return false;          /* 没配置云端：调用方自己会报错 */
    const c = latestContent();
    const myTs = c ? +(((c.config || {}).collab || {}).syncTs || 0) : 0;
    const why = pushColdGate({ pulled: GH.pulledOnce, lastPullTs: GH.lastPullTs, myTs: myTs });
    if (why === 'ok') { GH.guardAt = 0; return false; }
    const now = Date.now();
    try { ghPull(); } catch (e0) { /* noop */ }
    /* ★ 修复161（「一直显示在核对版本，死活也不上传」）：核对不能变成永久锁。
       旧版只要 pulledOnce 是 false 就无条件拦下 —— 而 pulledOnce 只有在拉取**成功**时才置真：
       api.github.com 连不上 / 15 秒超时 / Token 只有读权限 / 限流 403，任何一条都会让它
       永远 false，于是手动上传点一百次也只弹同一句话（自动推送那边有 15 秒兜底，手动没有）。
       现在判定交给纯函数 manualGateDecide（可单测），三条放行条件任一成立就不拦：
         ① 上一轮拉取**明确失败**（15 秒内）—— 云端内容根本读不到，本机这一笔是唯一出路；
         ② 当前没有拉取在飞（触发失败 / 已复位）—— 没什么可等；
         ③ 已经拦过 6 秒以上 —— 网络半死不活时也不能把用户锁死在这里。
       仍然拦的只剩「正在核对」（≤6 秒）和「已知云端更新」（先合再传，安全）。 */
    const ok = manualGateDecide({
      why: why, pullErrAt: GH.pullErr ? (+GH.pullErr.at || 0) : 0, now: now,
      inFlight: GH.inFlight, inFlightAt: GH.inFlightAt, guardAt: GH.guardAt
    });
    if (ok === 'allow') {
      GH.guardAt = 0;
      try {
        LMApp.toast(GH.pullErr
          ? '⚠ 云端版本没核对到（' + GH.pullErr.msg + '）—— 已按本机内容上传；若别的设备刚改过，请先刷新页面再传'
          : '⚠ 云端版本暂时核对不到 —— 已按本机内容上传（刷新页面可先同步别人的修改）');
      } catch (e1) { /* noop */ }
      return false;                                  /* 放行 */
    }
    GH.guardAt = GH.guardAt || now;
    try {
      LMApp.toast(why === 'behind'
        ? '⚠ 云端有更新的内容（别的设备刚存过），正在先拉取 —— 合好后请再点一次上传'
        : '☁ 正在核对云端版本（本页还没拉到最新内容）—— 等 1 秒再点一次上传'
          + (GH.pullErr ? '；上次核对失败：' + GH.pullErr.msg : ''));
    } catch (e2) { /* noop */ }
    return true;                                     /* 拦下（有界，最多 6 秒） */
  }
  /* ★ 修复161：同步诊断（控制台 LMCollab.ghDiag() 可直接看）——
     「为什么传不上去」不再只能靠猜：把分支、是否核对过、上次失败原因一次说清 */
  function ghDiag() {
    try {
      const bits = [];
      bits.push('仓库：' + ((GH.cfg && GH.cfg.owner) || '?') + '/' + ((GH.cfg && GH.cfg.repo) || '?'));
      bits.push('数据分支：' + ghBranch());
      bits.push('已核对云端版本：' + (GH.pulledOnce ? '是' : '否'));
      bits.push('云端版本戳：' + (GH.lastPullTs || 0));
      if (GH.pullErr) bits.push('上次拉取失败：' + GH.pullErr.msg + '（' + Math.round((Date.now() - GH.pullErr.at) / 1000) + ' 秒前）');
      if (GH.cloudMissing) bits.push('云端还没有这份内容（首次上传会自动创建）');
      if (GH.blockUntil > Date.now()) bits.push('限流退避 ' + Math.round((GH.blockUntil - Date.now()) / 1000) + ' 秒');
      if (GH.dirty) bits.push('有内容待上传');
      return bits.join(' · ');
    } catch (e) { return '诊断不可用：' + (e && e.message ? e.message : e); }
  }
  function ghPush(content) {
    if (!GH.cfg || !GH.token || !window.LMStore) return;
    /* 防旧覆盖新守卫：最近一次轮询看到的云端版本比本机内容新（其他设备刚推过）→
       本机不推送（避免旧内容盖掉别人的新内容），改为立即拉取应用 */
    const myTs = +(((content.config || {}).collab || {}).syncTs || 0);
    /* ★ 修复149：先过「冷启动 / 落后」闸门（见 pushColdGate 注释里的真实提交证据） */
    const cold = pushColdGate({ pulled: GH.pulledOnce, lastPullTs: GH.lastPullTs, myTs: myTs });
    if (cold === 'cold') {
      /* 本页还没跟云端对过话：这一笔先记账，立刻去拉，落地后再补推。
         ★ 兜底：15 秒还拉不到（Token 只有写权限 / 网络黑洞）→ 放行，
         宁可冒一次「内容可能更旧」的风险，也不能让用户改了半天一个字都上不去。 */
      GH.coldAt = GH.coldAt || Date.now();
      if (Date.now() - GH.coldAt < 15000) { wantPush(); kickPush(1200); ghPull(); return; }
    } else { GH.coldAt = 0; }
    if (cold === 'behind') {
      /* ★ 修复142（「内容还是不能及时同步」的第二个环节）：云端比我新 → 先拉，这一步本身没错；
         错在旧版这里**裸 return**，等于把这一笔静静扔掉：既不记账也不重试。
         只要对端时钟快一点点（手机/电脑时钟差几十秒很常见），本机每次保存出来的戳都比云端小，
         于是**每一笔**都走这条路 → 本机改的内容永远上不了云，对方几分钟都看不见，
         而自己屏幕上一切正常（内容就在本机）。现在按修复140 的同一套处理：记账 + 补推。 */
      wantPush(); kickPush(1500);
      ghPull();
      return;
    }
    const now = Date.now();
    pushBusyStale();                   /* ★ 修复140：推送自己的看门狗（拉取那把锁另有一套，互不干扰） */
    /* ★ 修复88 / 90 / 140：最小间隔 = max(有人在线 2.6s / 独自 6s, 额度降挡)；
       退出键入时跳过防抖，只守 700ms 硬底（连点十个框也只发一笔） */
    const gate = pushGate({
      now: now, lastPush: GH.lastPush, busy: GH.pushBusy, blockUntil: GH.blockUntil,
      waitMin: GH.flushAsap ? flushWaitMin(now, GH.lastPush) : pushWaitMin(peersHot()),
      rateGap: GH.flushAsap ? 0 : rateGap()
    });
    if (!gate.go) {
      /* ★ 修复140：不发 ≠ 不管 —— 记账 + 定时补推（旧版这里裸 return，这一笔就此消失） */
      wantPush();
      if (gate.why !== 'busy') kickPush(gate.wait);   /* busy：那一笔落定时自己会补推 */
      return;
    }
    const ref = ghBranch();      /* ★ 修复89：默认写数据分支（不触发 Pages 构建） */
    const text = LMStore.buildFileText(content);
    /* ★ 修复90：与上次成功推送的文本完全一致 → 不发 PUT（协同里很多 commit 只动了时间戳，纯白烧额度）
       ★ 修复140：这也说明云端已是这份内容 → 脏标记可以结清 */
    if (text === GH.lastText) { pushClean(); return; }
    GH.lastPush = now;
    /* ★ 修复140：发之前先记脏 —— 断网 / 锁 / 限流 / 页面被切走，这一笔都不会失踪 */
    wantPush();
    GH.pushBusy = true; GH.pushBusyAt = now;   /* ★ 修复122：记时刻，供看门狗判定 */
    const b64 = LMStore.utf8ToBase64 ? LMStore.utf8ToBase64(text) : btoa(unescape(encodeURIComponent(text)));
    const H = { 'Authorization': 'Bearer ' + GH.token, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' };
    const put = function (br, sha) {
      const body = { message: '协作同步（' + me.name + '）' + new Date().toLocaleString('zh-CN'), content: b64, branch: br };
      if (sha) body.sha = sha;
      return fetchT(ghApi(), { method: 'PUT', headers: H, body: JSON.stringify(body) }, 30000);
    };
    const getSha = function (br) {
      /* ★ 修复162：优先用「本机基于的那一版」的 sha，而不是云端最新 sha。
         拿最新 sha 当锁 = 锁永远对得上 = 旧设备照样整包覆盖（09 号三张地图被写回模板就是这么发生的）。
         用基准 sha 提交，云端若已前进 → 409 → 拉取合并后再推，谁都不会被静默顶掉。 */
      if (baseShaOf[br]) return Promise.resolve(baseShaOf[br]);
      if (shaOf[br]) return Promise.resolve(shaOf[br]);
      return fetchT(ghApi() + '?ref=' + encodeURIComponent(br), {
        headers: { 'Authorization': 'Bearer ' + GH.token, 'Accept': 'application/vnd.github+json' }
      }, 15000).then(function (r) { return r.ok ? r.json().then(function (j) { return j.sha; }) : null; });
    };
    let putRetried = false;            /* ★ 修复162：「带基准 sha 却 404」只重试一次 */
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
              delete baseShaOf[br];   /* ★ 修复162：新建的分支没有基准版本 */
              return getSha(br).then(function (s2) { return put(br, s2); });
            });
          }
          /* ★ 修复162：带着基准 sha 提交却 404 —— 文件被删过 / 分支被重建。
             清掉基准，重新取一次真实 sha 再试（只一次，避免打转）；
             注意 409 不走这里：那是「云端真的前进了」，必须交给外层拉取合并。 */
          if (had && r.status === 404 && !putRetried) {
            putRetried = true;
            delete shaOf[br];
            delete baseShaOf[br];
            return tryPut(br);
          }
          return r;
        });
      });
    };
    tryPut(ref).then(function (r) {
      noteRate(r);                       /* ★ 修复90：记下剩余额度，决定下一轮要不要降挡 */
      if (r.status === 409 || r.status === 422) { /* 别人先提交 → 拉最新；立刻（0.9 秒）尾随重推一次 */
        pushUnlock();
        wantPush();                          /* ★ 修复140：脏标记留着（0.9 秒后 _409T 会重推；关页面也还有下次补推） */
        delete shaOf[ref]; ghPull();
        /* ★ 修复142：这一笔 PUT 根本没写进去 → 不能算「上次推送时刻」，否则重推先在防抖里再等 1.5–4 秒，
           两台设备交替编辑时就这样一次次叠加成「半分钟才动」。清掉它，重推立刻能过闸。 */
        GH.lastPush = 0;
        /* ★ 修复162：409/422 = 云端已被别人推过，本机基准落后。
           必须等这一轮「拉取 + 块级合并」真的落地再重推，否则第二次还是拿旧内容去撞；
           连续撞超过 6 次（拉取一直不成功：断网 / 限流 / 无权限）就退避，别打成死循环。 */
        const retryPush = function () {
          GH._409T = null;
          if (GH.inFlight) {
            GH._409N = (+GH._409N || 0) + 1;
            if (GH._409N > 6) { GH._409N = 0; pushFail(5000); return; }
            GH._409T = setTimeout(retryPush, 600);
            return;
          }
          GH._409N = 0;
          if (window.LMApp && validContent(LMApp.state.content)) ghPush(LMApp.state.content);
        };
        if (!GH._409T) GH._409T = setTimeout(retryPush, 900);
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
          /* ★ 修复140：退避到期自动补推 —— 旧版退避期内裸 return，退避结束后也没人再推，
             现场看到的就是「退出键入以后一直没反应」，得再改一次才有机会发出去 */
          pushFail(Math.min(ms, 5000));
          return;
        }
        if (r.status === 401) {
          if (!GH._authToast) {
            GH._authToast = true;
            toast('🔑 GitHub Token 无效或已过期：请到「☁ 同步到 GitHub」重新粘贴（其他设备的内容同步不受影响）');
          }
          GH.blockUntil = Date.now() + 120000;
          pushFail(5000);   /* ★ 修复140：换好 Token 后脏标记还在，会自动补推 */
          return;
        }
        if (!branchMissing) { pushFail(8000); return; }   /* 5xx / 其他：稍后再试，不动分支策略 */
        if (!GH.useMain && ghDataRef() !== ghMainRef()) {
          const bad = ghDataRef();
          GH.useMain = true;
          GH.etag = ''; delete shaOf[ghMainRef()];
          toast('⚠ 数据分支「' + bad + '」不可用（Token 权限或分支受限），已回退到 ' + ghMainRef() + '：内容同步照常，但会触发 Pages 构建');
          wantPush();                                  /* ★ 修复140：回退后这一笔必须重发到 main */
          pushUnlock();
          if (window.LMApp && validContent(LMApp.state.content)) ghPush(LMApp.state.content);
        } else {
          pushFail(8000);
        }
        return;
      }
      GH.lastText = text;               /* ★ 修复90：记下已推送文本，供下一轮去重 */
      GH.lastPushTs = myTs;             /* ★ 修复140：记下已推上去的版本戳（退出键入时不必再序列化比对） */
      return r.json().then(function (j) {
        shaOf[ref] = j.content && j.content.sha;
        baseShaOf[ref] = shaOf[ref];   /* ★ 修复162：推上去的这一版就是新的基准 */
        /* ★ 修复62 / 83：上传成功 → 只重拍「最近上传版」pushSnap，绝不再动 adminSnap */
        try {
          if (window.LMApp && validContent(LMApp.state.content)) {
            if (LMApp.takePushSnap) LMApp.takePushSnap();
            else if (LMApp.takeAdminSnap) LMApp.takeAdminSnap(); /* 旧版兜底 */
          }
        } catch (eSnap) { /* noop */ }
        maybeSnapshot(text);   /* ★ 修复89：顺带刷新 main 快照（≤2 次/小时，只喂首屏） */
        pushDone(text);        /* ★ 修复140：成功收尾 —— 推的过程中又改了会自动补推 */
      });
    }).catch(function () {
      /* ★ 修复140：网络异常 / 超时 / 响应不是 JSON → 放锁 + 4 秒后补推（旧版只是放锁，这一笔就此蒸发） */
      pushFail(4000);
    });
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
      GH.syncedText = '';      /* ★ 修复153：换仓库/分支 → 内容基线作废（下一轮重新比对） */
      /* ★ 修复140：换仓库/换 Token → 上一套的推送状态一并清掉（否则会拿旧的脏标记/版本戳乱补推） */
      GH.lastPushTs = 0; GH.dirty = false; GH.dirtyAt = 0; GH.kickN = 0;
      GH.pulledOnce = false;   /* ★ 修复149：换仓库了 → 必须重新拉一次才知道云端是哪一版，不许急着推 */
      Object.keys(shaOf).forEach(function (k) { delete shaOf[k]; });
    }
    if (GH.cfg && GH.cfg.owner && GH.cfg.repo && GH.token) {
      if (GH._wired !== 'admin') {
        GH._wired = 'admin';
        transports.push({ send: function (msg) { if (msg.type === 'commit' && msg.content) ghPush(msg.content); } });
        modeLabel = '本机+云端';
        /* ★ 修复88：节拍 2s → 600ms；★ 修复150：再收到 300ms（gap 判定误差 ≤300ms）。
           旧版「每 2 秒才检查一次、且要够 2 秒才拉」在定时器抖动下实际常变成 4 秒一次
           （用户感受就是「在线协同更新很慢」）；现在按 gap 判定，误差 ≤300ms。
           有人在线时 gap 自动切到 0.8s / 1s，没别人时 1s / 2s（★ 修复142 / 150：见文件顶部常量注释） */
        setInterval(function () {
          const hidden = document.visibilityState === 'hidden';
          const act = Date.now() - (window._lmLastAct || 0) < 30000;
          const gap = pollGapNow(hidden, act, peersHot());
          if (!GH.timer || Date.now() - GH.timer >= gap) { GH.timer = Date.now(); ghPull(); }
        }, 300);
      }
      ghPull();
      /* ★ 修复140：上次关页面 / 崩溃时还有一笔没推上去（脏标记落在本机）→ 这次一打开就补推，
         不必等用户再编辑一次才「顺带」发出去 */
      try {
        if (localStorage.getItem(DIRTY_KEY) === '1') { wantPush(); kickPush(1500); }
      } catch (eDirty) { /* noop */ }
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
        /* ★ 修复88 / 142：访客从前台 90 秒 → 25 秒 → 8 秒；★ 修复150：再提到 4 秒（后台 45 秒）。
           raw 请求已带 ?t= 破缓存，所以手机访客看别人改的内容不再「要等一分半」 */
        setInterval(function () {
          const gap = visitorGapNow(document.visibilityState === 'hidden');
          if (!GH.timer || Date.now() - GH.timer >= gap) { GH.timer = Date.now(); ghPull(); }
        }, 500);
      }
      ghPull();
    } else if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(h) && location.protocol !== 'file:') {
      /* ★ 修复153（「手机上永远不更新，但看不出为什么」）：访客通道靠 GitHub Pages 的网址推导
         owner/repo；一旦站点是从**自定义域名 / 镜像 / 反代**打开的，这里推不出来 → 云端轮询
         **根本没启动**，而旧版完全静默：手机上看着正常、就是永远不更新。现在明确提示一次。 */
      try {
        console.warn('[协同·云端] 当前域名 ' + h + ' 不是 *.github.io，无法自动推导 owner/repo → 云端轮询未启动（本机 / 局域网通道照常工作）');
        if (!sessionStorage.getItem('lm_gh_nohost')) {
          sessionStorage.setItem('lm_gh_nohost', '1');
          setTimeout(function () {
            try { if (window.LMApp) LMApp.toast('提示：本页不在 github.io 域名下，收不到云端更新（用 GitHub Pages 的地址打开即可）'); } catch (eT3) { /* noop */ }
          }, 2600);
        }
      } catch (eNo) { /* noop */ }
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
    window.addEventListener('blur', function () { pointerDown = false; pointerAt = 0; flushPending(); flushPushSoon('窗口失焦'); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        /* ★ 修复140：手机切走 / 锁屏前把「刚退出的那一笔」立刻推上云 —— 后台定时器会被系统冻结，
           focusout 也可能根本收不到，这里是最后的发射窗口 */
        pointerDown = false; pointerAt = 0;
        flushPushSoon('切后台');
        return;
      }
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
    /* ★ 修复140：「退出键入」= 立刻发送 —— editor.js 先加载、监听先执行，这次改动已经写进 state
       并 commit 过，这里补一记「立刻推」，不再等 2.6s / 6s 的防抖 */
    document.addEventListener('focusout', function () { releaseLock(); flushPending(); flushPushSoon('退出键入'); });
    window.addEventListener('beforeunload', function () { releaseLock(); send({ type: 'bye' }); });
    /* ★ 修复140：关页面/前进后退前也把最后一笔推出去（beforeunload 里不能再等异步，pushFail 会记账，
       页面真被销毁时至少脏标记已写进本地内容，下次打开 first-push 会补） */
    window.addEventListener('pagehide', function () { flushPush('关页面'); });
    window.addEventListener('load', function () { paintChip(); enforceBans(); });
    enforceBans();
    ghInit();
  }
  init();
  return {
    publish: publish,
    flushPush: flushPush,          /* ★ 修复140：退出键入 / 切后台 / 关页面 → 跳过防抖立刻推（editor.js 也调） */
    flushPushSoon: flushPushSoon,
    guardManualPush: guardManualPush,   /* ★ 修复149：手动上传前先核对云端版本（落后就先拉，别把云端推回旧版） */
    ghDiag: ghDiag,                     /* ★ 修复161：控制台 LMCollab.ghDiag() 一眼看清「为什么传不上去」 */
    pushState: function () {       /* ★ 修复140：现场核对「这一笔到底发出去没有」 */
      return { 待推送: GH.dirty, 待推送秒: GH.dirtyAt ? Math.round((Date.now() - GH.dirtyAt) / 1000) : 0,
               推送中: GH.pushBusy, 退避剩秒: GH.blockUntil > Date.now() ? Math.round((GH.blockUntil - Date.now()) / 1000) : 0,
               有补推定时代: !!GH.kickT, 连续补推: GH.kickN,
               上次推送秒前: GH.lastPush ? Math.round((Date.now() - GH.lastPush) / 1000) : -1 };
    },
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
    /* ★ 修复142：控制台手动催一次（排查「到底卡在哪一环」用）—— 立刻推一笔 + 立刻拉一次 */
    syncNow: function () {
      try { flushPush('手动'); } catch (e1) { /* noop */ }
      try { ghPull(); } catch (e2) { /* noop */ }
      return true;
    },
    /* ★ 修复153：一键硬重试（清退避/回退/main/缓存 → 先拉再补推）。手机端胶囊面板上的「🔄 立即同步」 */
    forceSync: forceSync,
    syncLine: syncLine,
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
        正在编辑块: (typeof myEditing === 'undefined' ? null : myEditing), /* ★ 修复163：myEditing 在 ycollab 作用域里，直接取值会抛 ReferenceError，把整个 diag 打断 */
        Yjs就绪: !!(window.LMYCollab && window.LMYCollab.yjs),
        Yjs同伴: (window.LMYCollab && window.LMYCollab.peerCount) ? window.LMYCollab.peerCount() : 0,
        /* ★ 修复163：直连打不通时，看这两项判断「对面到底在不在」——
           MQTT在场设备 > 0 表示信令层看得见人；状态通道 mqtt 表示「谁在改哪块」已走中继，不再依赖 P2P */
        MQTT在场设备: (window.LMYCollab && window.LMYCollab.mqttPeers) ? window.LMYCollab.mqttPeers() : '未知',
        状态通道: (window.LMYCollab && window.LMYCollab.awarePath) ? window.LMYCollab.awarePath() : '未知',
        在线设备: liveCount(),
        通道: modeLabel,
        内容分支: (function () { try { return ghBranch() + (GH.useMain ? '（已回退 main）' : '') + (ghBranch() !== ghMainRef() ? '（不触发 Pages 构建）' : ''); } catch (e) { return '?'; } })(),
        额度剩余: (GH.rateLeft == null ? '未知（还没收到 GitHub 响应头）' : (GH.rateLeft + ' 次/小时 · 当前推送间隔 ' + (Math.max(pushWaitMin(peersHot()), rateGap()) / 1000) + ' 秒')),
        /* ★ 修复142：云端侧的「到底走到哪一步」—— 现场排查「内容没过去 / 没回来」先看这四项 */
        云端: {
          同步摘要: syncLine(),   /* ★ 修复153：一句话说明卡在哪一步（与胶囊面板同一句） */
          上次云端变更秒前: GH.lastPullAt ? Math.round((Date.now() - GH.lastPullAt) / 1000) : -1,
          云端版本戳: GH.lastPullTs || 0,
          本机版本戳: (function () { try { return +((((LMApp || {}).state || {}).content || {}).config.collab.syncTs || 0); } catch (e) { return 0; } })(),
          已应用云端戳: GH.mergedTs || 0,
          数据分支可用: GH.useMain ? '否（已回退 main）' : '是',
          /* ★ 修复149：false = 本页还没跟云端对过话，此时**不会推送**（防止旧标签页把云端倒退） */
          已核对云端版本: GH.pulledOnce ? '是（可以推送）' : '否（先拉再推）'
        },
        /* ★ 修复140：推送状态机 —— 「改了却没同步过去」时先看这几项（待推送=true 表示还有一笔没上云） */
        推送: {
          待推送: GH.dirty ? ('是（' + Math.round((Date.now() - (GH.dirtyAt || Date.now())) / 1000) + ' 秒前记账）') : '否',
          推送中: GH.pushBusy ? '是' : '否',
          限流退避剩秒: GH.blockUntil > Date.now() ? Math.round((GH.blockUntil - Date.now()) / 1000) : 0,
          有补推定时代: !!GH.kickT,
          连续补推次: GH.kickN || 0,
          上次推送秒前: GH.lastPush ? Math.round((Date.now() - GH.lastPush) / 1000) : -1,
          上次触发: GH.flushWhy || ''
        },
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
