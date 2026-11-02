#!/usr/bin/env node
/* =========================================================
   tools/mirror-feedback.js — 把 WorkBuddy 云表的「反馈」和「讨论区」镜像到 GitHub
   ---------------------------------------------------------
   背景：站点部署在两处，云表只认 WorkBuddy 的域名（服务端精确 Origin 校验），
   所以「这边收到的发言」GitHub 版看不到。本脚本把云表单向汇聚过去：

       云表 lm_feedback  ──镜像──▶  GitHub 分支 lm-data 的 data/feedback.json
       云表 lm_discuss   ──镜像──▶  GitHub 分支 lm-data 的 data/discuss.json

   合并规则与前端完全一致（否则前端读回来会乱）：
     · 反馈：按 id 去重，updatedAt（云表 updated_at 毫秒）大者胜；删除写墓碑 del:1
     · 讨论区：按 id 取并集，**正文不可覆盖、墓碑优先**（与 js/fbsync.js 的 dcMerge 一致）
     · 两者都按 ts 升序

   安全：
     · 只写 lm-data 分支的这两个文件，不碰 main、不触发 Pages 构建
     · 用 git worktree 在临时目录里操作，**不会**动你正在开发的主工作区
     · 没有新内容就不提交（不留空 commit）
     · push 被拒（别人先提交）→ 重新拉取、再合并、重试，最多 3 次，绝不强推

   用法：
     node tools/mirror-feedback.js            正向执行
     node tools/mirror-feedback.js --dry-run  只看会改什么，不写不推
     node tools/mirror-feedback.js --json     输出机器可读结果（给定时任务用）
   ========================================================= */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BRANCH = 'lm-data';
const DRY = process.argv.includes('--dry-run');
const AS_JSON = process.argv.includes('--json');

/* ---------- 云服务（路径与鉴权头取自 lib/workbuddy-cloud.js 的实测结果） ---------- */
const CFG = {
  endpoint: 'https://living-maps-25961.app.workbuddy.host',
  publishableKey: 'wbpk_e9lKeQNT7BcyfiUxce7I3a_LDV0yHeEuvo2DX30xShEBFHHvYBT4ejS'
};

function readCloud(table) {
  return new Promise((resolve) => {
    const url = CFG.endpoint + '/.cloud/database/rest/' + table + '?select=*&order=ts.asc&limit=2000';
    fetch(url, {
      headers: {
        'x-wb-webapp-access-key': CFG.publishableKey,
        'Origin': CFG.endpoint,
        'Referer': CFG.endpoint + '/',
        'Accept': 'application/json'
      }
    }).then(async (r) => {
      const txt = await r.text();
      if (!r.ok) return resolve({ ok: false, why: 'HTTP ' + r.status + ' ' + txt.slice(0, 200), rows: [] });
      let rows = [];
      try { rows = JSON.parse(txt); } catch (e) { return resolve({ ok: false, why: '响应不是 JSON：' + txt.slice(0, 120), rows: [] }); }
      if (!Array.isArray(rows)) return resolve({ ok: false, why: '响应不是数组', rows: [] });
      resolve({ ok: true, rows: rows, why: '' });
    }).catch((e) => resolve({ ok: false, why: String((e && e.message) || e), rows: [] }));
  });
}

/* ---------- 云表行 → 前端对象 ---------- */
const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

function rowToFeedback(r) {
  if (!r || !r.id || !r.text) return null;
  const it = {
    id: String(r.id),
    ts: +r.ts || 0,
    type: String(r.type || ''),
    name: clip(r.name || '匿名', 30),
    text: String(r.text || ''),
    dev: String(r.dev || ''),
    url: String(r.url || ''),
    status: String(r.status || '待处理'),
    reply: clip(r.reply || '', 200),
    check: String(r.check_note || ''),
    change: String(r.change_note || ''),
    why: String(r.why_note || '')
  };
  it.updatedAt = +r.updated_at || +r.ts || 0;
  if (+r.deleted) it.del = 1;
  return it;
}

function rowToDiscuss(r) {
  if (!r || !r.id || !r.text) return null;
  const o = {
    id: clip(r.id, 40),
    pid: clip(r.pid || '', 40),
    dev: clip(r.dev || '', 24),
    nick: clip(r.nick || '', 40),
    text: clip(r.text, 2000),
    ts: +r.ts || 0
  };
  if (r.rto) o.rto = clip(r.rto, 60);
  if (+r.deleted) o.del = +r.deleted;
  if (+r.updated_at) o.updatedAt = +r.updated_at;
  return o;
}

/* ---------- 规范化 ---------- */
function normFeedback(it) {
  if (!it || typeof it !== 'object' || !it.id) return null;
  const o = {
    id: String(it.id), ts: +it.ts || 0, type: String(it.type || ''),
    name: clip(it.name || '匿名', 30), text: String(it.text || ''),
    dev: String(it.dev || ''), url: String(it.url || ''),
    status: String(it.status || '待处理'), reply: clip(it.reply || '', 200),
    check: it.check != null ? it.check : (it.check_note != null ? it.check_note : ''),
    change: it.change != null ? it.change : (it.change_note != null ? it.change_note : ''),
    why: it.why != null ? it.why : (it.why_note != null ? it.why_note : '')
  };
  o.updatedAt = +it.updatedAt || o.ts || 0;
  if (it.del) o.del = 1;
  return o;
}

function normDiscuss(it) {
  if (!it || typeof it !== 'object' || !it.id) return null;
  const o = {
    id: clip(it.id, 40), pid: clip(it.pid || '', 40), dev: clip(it.dev || '', 24),
    nick: clip(it.nick || '', 40), text: clip(it.text, 2000), ts: +it.ts || 0
  };
  if (it.rto) o.rto = clip(it.rto, 60);
  if (it.del) o.del = +(it.del) || 1;
  if (it.updatedAt) o.updatedAt = +it.updatedAt;
  return o;
}

/* ---------- 合并 ---------- */
/* 反馈：updatedAt 大者胜（同 js/fbsync.js 的 merge） */
function mergeFeedback(a, b) {
  const map = {};
  (a || []).forEach((x) => { const n = normFeedback(x); if (n) map[n.id] = n; });
  (b || []).forEach((x) => {
    const n = normFeedback(x); if (!n) return;
    const old = map[n.id];
    if (!old || n.updatedAt >= old.updatedAt) map[n.id] = n;
  });
  return Object.keys(map).map((k) => map[k])
    .sort((x, y) => (x.ts - y.ts) || (x.id < y.id ? -1 : 1));
}

/* 讨论区：并集、正文不可覆盖、墓碑优先（同 js/fbsync.js 的 dcMerge） */
function mergeDiscuss(local, incoming) {
  const out = (Array.isArray(local) ? local : []).map(normDiscuss).filter(Boolean);
  const idx = {};
  out.forEach((m) => { idx[m.id] = m; });
  (Array.isArray(incoming) ? incoming : []).forEach((m) => {
    const n = normDiscuss(m);
    if (!n) return;
    const cur = idx[n.id];
    if (!cur) { out.push(n); idx[n.id] = n; return; }
    if (n.del && !cur.del) cur.del = n.del;
  });
  return out.sort((x, y) => (x.ts - y.ts) || (x.id < y.id ? -1 : 1));
}

/* ---------- 两个镜像任务 ---------- */
const TASKS = [
  { key: 'fb', label: '反馈', table: 'lm_feedback', file: 'data/feedback.json', toItem: rowToFeedback, merge: mergeFeedback },
  { key: 'dc', label: '讨论区', table: 'lm_discuss', file: 'data/discuss.json', toItem: rowToDiscuss, merge: mergeDiscuss }
];

/* ---------- git 小工具 ---------- */
function git(args, cwd, allowFail) {
  try {
    return execFileSync('git', args, {
      cwd: cwd || ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
      env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' })
    }).trim();
  } catch (e) {
    if (allowFail) return null;
    const msg = String((e && (e.stderr || e.stdout || e.message)) || e).trim();
    throw new Error('git ' + args.join(' ') + ' 失败：' + msg.split('\n').slice(0, 3).join(' | '));
  }
}

function readRemote(file, wt) {
  const p = path.join(wt, file);
  if (!fs.existsSync(p)) return [];
  try {
    const raw = fs.readFileSync(p, 'utf8').trim();
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function main() {
  const out = {
    ok: false, why: '', dry: DRY, pushed: false,
    items: { fb: { cloud: 0, remote: 0, merged: 0, added: 0, updated: 0 }, dc: { cloud: 0, remote: 0, merged: 0, added: 0, updated: 0 } }
  };
  let wt = '';

  const cleanup = () => {
    if (!wt) return;
    git(['worktree', 'remove', '--force', wt], ROOT, true);
    git(['worktree', 'prune'], ROOT, true);
    wt = '';
  };

  return Promise.all(TASKS.map((t) => readCloud(t.table))).then((clouds) => {
    const bad = clouds.filter((c) => !c.ok);
    if (bad.length === clouds.length) { out.why = '读云表失败：' + bad[0].why; return out; }

    git(['fetch', '--quiet', 'origin', BRANCH + ':refs/remotes/origin/' + BRANCH], ROOT, true);
    wt = path.join(os.tmpdir(), 'lm-mirror-' + process.pid + '-' + Date.now());
    git(['worktree', 'add', '--quiet', '--detach', wt, 'origin/' + BRANCH], ROOT);

    const changed = [];
    const mergedStore = {};

    TASKS.forEach((t, i) => {
      const cloud = clouds[i];
      const st = out.items[t.key];
      if (!cloud.ok) { st.error = cloud.why; return; }
      const cloudItems = cloud.rows.map(t.toItem).filter(Boolean);
      st.cloud = cloudItems.length;
      const remoteItems = readRemote(t.file, wt);
      st.remote = remoteItems.length;

      const merged = t.merge(remoteItems, cloudItems);
      st.merged = merged.length;
      mergedStore[t.key] = merged;

      const byId = {};
      remoteItems.forEach((x) => { const n = t.merge([], [x])[0]; if (n) byId[n.id] = n; });
      merged.forEach((m) => {
        const old = byId[m.id];
        if (!old) st.added++;
        else if (JSON.stringify(old) !== JSON.stringify(m)) st.updated++;
      });
      if (st.added || st.updated) changed.push(t);
    });

    const totalAdded = out.items.fb.added + out.items.dc.added;
    const totalUpdated = out.items.fb.updated + out.items.dc.updated;

    if (!changed.length) {
      out.ok = true;
      out.why = '无新增/变更，跳过一次';
      cleanup();
      return out;
    }
    if (DRY) {
      out.ok = true;
      out.why = 'dry-run：反馈 ' + out.items.fb.merged + ' 条、讨论区 ' + out.items.dc.merged
        + ' 条（新增 ' + totalAdded + '，更新 ' + totalUpdated + '），未提交';
      cleanup();
      return out;
    }

    try {
      changed.forEach((t) => {
        const p = path.join(wt, t.file);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, JSON.stringify(mergedStore[t.key]), 'utf8');
        git(['add', '--', t.file], wt);
      });

      const parts = [];
      if (out.items.fb.added || out.items.fb.updated) parts.push('反馈 +' + out.items.fb.added + '/~' + out.items.fb.updated);
      if (out.items.dc.added || out.items.dc.updated) parts.push('讨论区 +' + out.items.dc.added + '/~' + out.items.dc.updated);
      const msg = '云表镜像 ' + new Date().toLocaleString('zh-CN') + '（' + parts.join('，') + '）';

      git(['-c', 'user.name=feedback-mirror', '-c', 'user.email=mirror@local', 'commit', '--quiet', '-m', msg], wt);

      /* push：被拒就重新拉、重合并（最多 3 次），不强推 */
      let pushed = false, lastErr = '';
      for (let i = 0; i < 3 && !pushed; i++) {
        try {
          git(['push', '--quiet', 'origin', 'HEAD:' + BRANCH], wt);
          pushed = true;
        } catch (e) {
          lastErr = String((e && e.message) || e);
          git(['fetch', '--quiet', 'origin', BRANCH], wt, true);
          try {
            git(['reset', '--quiet', '--soft', 'origin/' + BRANCH], wt);
            changed.forEach((t) => {
              const fresh = readRemote(t.file, wt);
              const again = t.merge(fresh, mergedStore[t.key]);
              fs.writeFileSync(path.join(wt, t.file), JSON.stringify(again), 'utf8');
              git(['add', '--', t.file], wt);
            });
            git(['-c', 'user.name=feedback-mirror', '-c', 'user.email=mirror@local', 'commit', '--quiet',
              '-m', msg + '（重试 ' + (i + 1) + '）'], wt);
          } catch (e3) { /* 重试失败就下一轮 */ }
        }
      }

      out.pushed = pushed;
      out.ok = pushed;
      out.why = pushed ? '已提交并推送' : ('推送失败（已重试 3 次）：' + lastErr.split('\n')[0].slice(0, 160));
      cleanup();
      return out;
    } catch (e) {
      cleanup();
      out.why = String((e && e.message) || e);
      return out;
    }
  });
}

main().then((r) => {
  if (AS_JSON) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    const f = r.items.fb, d = r.items.dc;
    console.log('[镜像] 反馈　：云表 ' + f.cloud + ' / 远端 ' + f.remote + ' → ' + f.merged + ' 条（新增 ' + f.added + '，更新 ' + f.updated + '）');
    console.log('[镜像] 讨论区：云表 ' + d.cloud + ' / 远端 ' + d.remote + ' → ' + d.merged + ' 条（新增 ' + d.added + '，更新 ' + d.updated + '）');
    console.log('[镜像] ' + (r.ok ? '✅ ' : '❌ ') + r.why);
  }
  process.exit(r.ok ? 0 : 1);
}).catch((e) => {
  console.log('[镜像] ❌ 未预期错误：' + String((e && e.message) || e));
  process.exit(1);
});
