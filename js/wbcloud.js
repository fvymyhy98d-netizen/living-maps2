/* =========================================================
   wbcloud.js — WorkBuddy 云服务反馈通道（第一优先）
   ---------------------------------------------------------
   为什么有这个文件：课程要求「反馈必须真实共享，且建在 WorkBuddy 云服务数据库上；
   禁止用 localStorage 冒充共享存储」。原来的三条通道（GitHub 数据分支 / MQTT / Supabase 云存档）
   都保留不动，这个文件只是再加一条**排在最前面**的通道：
       ① WorkBuddy 云服务数据库（本文件，跨设备、永久、无 Key）→ 失败自动降级
       ② Supabase / 自建 Worker 云存档（fbsync.js 原有能力，配置不变）
       ③ GitHub 数据分支 + MQTT 实时 + 「复制给组长」链接（原有能力，配置不变）
   所以站点在 GitHub Pages 上照旧能用（那里云服务 Origin 对不上，会自动跳过本条）。

   安全：
     · 这里只有 endpoint + publishableKey —— 按云服务规范，publishableKey 只标识「哪个应用」，
       本身不带任何权限，真正的边界是服务端 RLS 与精确 Origin 校验；
     · 反馈表 lm_feedback 的 RLS 只给 anon 开了 SELECT / INSERT，
       **没有** UPDATE / DELETE 策略 → 前端改不了状态和回复，
       小组回复与状态只能在「WorkBuddy 云服务 → 数据库 → 数据」里改（正是课程要求的做法）。
     · 表格的 updated_at 由数据库触发器写入（本机不传），
       这样管理员在面板里改过的行，下一次拉取时时间戳更新、会正确覆盖旧值。
   ========================================================= */
(function (W) {
  'use strict';

  /* 云服务 publicConfig（开通时下发；endpoint 与站点同域，CSP 的 'self' 直接覆盖） */
  var CFG = {
    endpoint: 'https://living-maps-25961.app.workbuddy.host',
    publishableKey: 'wbpk_e9lKeQNT7BcyfiUxce7I3a_LDV0yHeEuvo2DX30xShEBFHHvYBT4ejS'
  };
  var TABLE = 'lm_feedback';
  var LIMIT = 1000;

  var client = null, lastWhy = '';

  function init() {
    if (client) return client;
    try {
      var G = W.WorkBuddyCloud;
      if (!G || typeof G.createWorkBuddyCloud !== 'function') {
        lastWhy = '云服务 SDK 未加载（lib/workbuddy-cloud.js）';
        return null;
      }
      client = G.createWorkBuddyCloud({
        endpoint: CFG.endpoint,
        publishableKey: CFG.publishableKey
      });
      lastWhy = '';
    } catch (e) {
      client = null;
      lastWhy = '云服务初始化失败：' + String((e && e.message) || e);
    }
    return client;
  }

  function clip(v, n) { return String(v == null ? '' : v).slice(0, n); }

  /* 本机对象 → 表行。updated_at 故意不传：由数据库触发器写，避免前端伪造时间戳。 */
  function toRow(it) {
    if (!it || !it.id || !it.text) return null;
    return {
      id: clip(it.id, 40),
      ts: +it.ts || Date.now(),
      type: clip(it.type || '', 40),
      name: clip(it.name || '匿名', 30),
      text: clip(it.text, 800),
      dev: clip(it.dev || '', 24),
      url: clip(it.url || '', 300),
      status: clip(it.status || '待处理', 12),
      reply: clip(it.reply || '', 200),
      check_note: clip(it.check || it.check_note || '', 300),
      change_note: clip(it.change || it.change_note || '', 300),
      why_note: clip(it.why || it.why_note || '', 300),
      deleted: (it.del ? 1 : 0)
    };
  }

  /* 表行 → 本机对象（字段名对齐 fbsync.norm：check_note 等别名它自己会认） */
  function fromRow(r) {
    if (!r || !r.id) return null;
    return {
      id: String(r.id),
      ts: +r.ts || 0,
      type: String(r.type || ''),
      name: String(r.name || '匿名'),
      text: String(r.text || ''),
      dev: String(r.dev || ''),
      url: String(r.url || ''),
      status: String(r.status || '待处理'),
      reply: String(r.reply || ''),
      check_note: String(r.check_note || ''),
      change_note: String(r.change_note || ''),
      why_note: String(r.why_note || ''),
      updatedAt: +r.updated_at || +r.ts || 0,
      del: (+r.deleted || 0) ? 1 : 0
    };
  }

  /* 写一条。成功 true；主键冲突也算成功（同一条已经存在，不该让用户以为没发出去）。 */
  function save(item) {
    var c = init(), row = toRow(item);
    if (!c || !row) return Promise.resolve(false);
    try {
      return Promise.resolve(c.database.from(TABLE).insert(row)).then(function (res) {
        var err = res && res.error;
        if (!err) return true;
        /* 主键冲突：同一条已经在云端了（重复提交 / 多设备同时发），对用户就是成功。
           云服务的错误码形如 DATABASE_23505，所以用后缀匹配而不是全等。 */
        var code = String(err.code || '');
        if (/(^|_)23505$/.test(code)) return true;
        lastWhy = err.message || code || String(err);
        return false;
      }).catch(function (e) {
        lastWhy = String((e && e.message) || e);
        return false;
      });
    } catch (e2) {
      lastWhy = String((e2 && e2.message) || e2);
      return Promise.resolve(false);
    }
  }

  /* 读全部（按提交时间正序） */
  function list() {
    var c = init();
    if (!c) return Promise.resolve({ ok: false, list: [], why: lastWhy || '云服务未就绪' });
    try {
      return Promise.resolve(
        c.database.from(TABLE).select('*').order('ts', { ascending: true }).limit(LIMIT)
      ).then(function (res) {
        if (res && res.error) {
          lastWhy = res.error.message || String(res.error);
          return { ok: false, list: [], why: lastWhy };
        }
        var arr = (res && res.data) || [];
        if (!Array.isArray(arr)) arr = [];
        return { ok: true, list: arr.map(fromRow).filter(Boolean), why: '' };
      }).catch(function (e) {
        lastWhy = String((e && e.message) || e);
        return { ok: false, list: [], why: lastWhy };
      });
    } catch (e2) {
      lastWhy = String((e2 && e2.message) || e2);
      return Promise.resolve({ ok: false, list: [], why: lastWhy });
    }
  }

  /* 给管理面板看的连接状态（不显示 key） */
  function info() {
    var on = !!init();
    var host = '';
    try { host = String(CFG.endpoint).replace(/^https:\/\//i, '').split('/')[0]; } catch (e) { /* noop */ }
    return {
      on: on, table: TABLE, host: host,
      text: on ? ('WorkBuddy 云服务 · ' + host + ' · ' + TABLE) : (lastWhy || '未就绪')
    };
  }

  W.LMWB = {
    save: save, list: list, info: info,
    toRow: toRow, fromRow: fromRow, table: TABLE, endpoint: CFG.endpoint
  };
})(typeof window !== 'undefined' ? window : {});
