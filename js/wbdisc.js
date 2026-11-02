/* =========================================================
   wbdisc.js — 讨论区云通道（WorkBuddy 云服务 · 表 lm_discuss）
   ---------------------------------------------------------
   为什么单独一个文件：讨论区原来只写 Supabase 云存档（见 fbsync.js 的 dcSave），
   没配 Supabase 的设备发言就只能在本地。这里给讨论区加一条**始终可用**的云通道，
   排在最前面，失败自动降级回原来的 Supabase —— 原有方案一行没删。

   表结构（云服务面板可查）：
     id TEXT 主键 / pid 父帖(空=帖子) / dev 设备号 / nick 昵称 / text 正文
     ts 发言时间 / rto 引用 / deleted 删除墓碑(0=未删) / updated_at 由触发器写

   安全设计（与反馈表同一套思路，但讨论区多一条）：
     · 访客只有 SELECT / INSERT / UPDATE，**没有 DELETE** —— 删帖写墓碑（deleted 置时间戳），
       这样别的设备才知道「这条被删了」，而不是「从来没发过」。
     · 数据库触发器 lm_discuss_guard 挡住 UPDATE 改正文：
       发言一旦发出就不可改，只允许标记删除（报错原文：讨论区发言不可修改）。
       RLS 管「谁能写」，触发器管「写了什么」，两层一起才拦得住直接调 API 的人。
     · updated_at 一律由触发器写，前端不传，避免伪造时间戳把别人的新内容盖掉。
   ========================================================= */
(function (W) {
  'use strict';

  var CFG = {
    endpoint: 'https://living-maps-25961.app.workbuddy.host',
    publishableKey: 'wbpk_e9lKeQNT7BcyfiUxce7I3a_LDV0yHeEuvo2DX30xShEBFHHvYBT4ejS'
  };
  var TABLE = 'lm_discuss';
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

  /* 本机对象 → 表行。updated_at 故意不传：由数据库触发器写。 */
  function toRow(it) {
    if (!it || !it.id || !it.text) return null;
    var row = {
      id: clip(it.id, 40),
      pid: clip(it.pid || '', 40),
      dev: clip(it.dev || '', 24),
      nick: clip(it.nick || '', 40),
      text: clip(it.text, 2000),
      ts: +it.ts || Date.now(),
      rto: clip(it.rto || '', 60),
      deleted: (it.del ? (+it.del || 1) : 0)
    };
    if (!row.id || !row.text) return null;
    return row;
  }

  /* 表行 → 本机对象（字段名对齐 fbsync.dcSlim：del 保留原来的数值语义） */
  function fromRow(r) {
    if (!r || !r.id) return null;
    var o = {
      id: String(r.id),
      pid: String(r.pid || ''),
      dev: String(r.dev || ''),
      nick: String(r.nick || ''),
      text: String(r.text || ''),
      ts: +r.ts || 0
    };
    if (r.rto) o.rto = String(r.rto);
    if (+r.deleted) o.del = +r.deleted;
    if (+r.updated_at) o.updatedAt = +r.updated_at;
    return o;
  }

  /* 批量写（upsert）：同 id 再写就覆盖 —— 删除墓碑、昵称变更都要能落到云端。
     单条失败不抛错；全部失败才返回 false（调用方据此决定要不要降级到 Supabase）。 */
  function save(items) {
    var c = init();
    var arr = (Array.isArray(items) ? items : [items]).map(toRow).filter(Boolean);
    if (!c || !arr.length) return Promise.resolve(false);
    try {
      return Promise.resolve(c.database.from(TABLE).upsert(arr, { onConflict: 'id' })).then(function (res) {
        var err = res && res.error;
        if (!err) return true;
        lastWhy = err.message || err.code || String(err);
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

  /* 读全部（按发言时间正序） */
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

  function info() {
    var on = !!init();
    var host = '';
    try { host = String(CFG.endpoint).replace(/^https:\/\//i, '').split('/')[0]; } catch (e) { /* noop */ }
    return {
      on: on, table: TABLE, host: host,
      text: on ? ('WorkBuddy 云服务 · ' + host + ' · ' + TABLE) : (lastWhy || '未就绪')
    };
  }

  W.LMWBDisc = {
    save: save, list: list, info: info,
    toRow: toRow, fromRow: fromRow, table: TABLE, endpoint: CFG.endpoint
  };
})(typeof window !== 'undefined' ? window : {});
