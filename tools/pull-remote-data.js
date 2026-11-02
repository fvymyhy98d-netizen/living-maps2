#!/usr/bin/env node
/* ★ 修复155：发布前"先拉最新"，防止用旧本地内容覆盖线上
 *
 * 背景：本站同时挂在两处 ——
 *   ① GitHub Pages（仓库 main 分支，自动发布）——「内容」的真源：组内在管理员模式里改完就提交到这里
 *   ② WorkBuddy（静态快照，由维护者手动重新发布）——对外给同学用的那个链接
 * 问题：如果组里在 GitHub 上改过内容，而这边还是旧文件，直接重新发布 = 用旧内容覆盖线上。
 *
 * 这个脚本只处理 **数据文件**（content.js / lm.json / sensitive-words.js），
 * 不碰代码（代码以本地为准，本地比仓库新）。判断依据是 GitHub 上该文件最后一次提交时间 vs 本地修改时间：
 *   远端更新  → 提示（加 --pull 才真正覆盖本地，覆盖前留 .prev 备份）
 *   本地更新  → 提示"该推到仓库了"，不动文件
 *
 * 用法：
 *   node tools/pull-remote-data.js                  # 只看差异，不改任何文件
 *   node tools/pull-remote-data.js --pull           # 远端更新时才覆盖本地
 *   node tools/pull-remote-data.js --pull --force   # 无条件用远端覆盖（慎用）
 *   node tools/pull-remote-data.js --repo=owner/name --branch=main
 *
 * 退出码：0 已一致 / 1 出错 / 2 有差异待处理（与 train_lm --check 的习惯一致）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const DIR = path.join(__dirname, '..');
const DEFAULT_REPO = 'fvymyhy98d-netizen/living-maps2';
const FILES = ['data/content.js', 'data/lm.json', 'data/sensitive-words.js'];

const args = process.argv.slice(2);
const has = (f) => args.indexOf(f) >= 0;
const val = (k, d) => {
  const hit = args.filter((a) => a.indexOf(k + '=') === 0)[0];
  return hit ? hit.slice(k.length + 1) : d;
};
const REPO = val('--repo', DEFAULT_REPO);
const BRANCH = val('--branch', 'main');
const PULL = has('--pull');
const FORCE = has('--force');

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'living-maps-sync-check',
        Accept: 'application/vnd.github+json',
        'Cache-Control': 'no-cache',
      },
      timeout: 20000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return get(res.headers.location).then(resolve, reject);
      }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { buf += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on('timeout', () => { req.destroy(new Error('请求超时')); });
    req.on('error', reject);
  });
}

/* 该文件在远端的最后一次提交时间（毫秒）；查不到返回 0 */
async function remoteTime(file) {
  const u = 'https://api.github.com/repos/' + REPO + '/commits?path=' + encodeURIComponent(file)
    + '&sha=' + encodeURIComponent(BRANCH) + '&per_page=1';
  const r = await get(u);
  if (r.status !== 200) return { ms: 0, note: 'HTTP ' + r.status };
  let j;
  try { j = JSON.parse(r.body); } catch (e) { return { ms: 0, note: '返回不是 JSON' }; }
  if (!Array.isArray(j) || !j.length) return { ms: 0, note: '该路径没有提交记录' };
  const c = j[0].commit && j[0].commit.committer;
  const ms = Date.parse((c && (c.date || c.committed_at)) || '');
  return { ms: isNaN(ms) ? 0 : ms, note: 'commit ' + String(j[0].sha || '').slice(0, 7) };
}

async function raw(file) {
  const u = 'https://raw.githubusercontent.com/' + REPO + '/' + encodeURIComponent(BRANCH) + '/' + file + '?t=' + Date.now();
  const r = await get(u);
  if (r.status !== 200) throw new Error('拉取 ' + file + ' 失败：HTTP ' + r.status);
  return r.body;
}

function fmt(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

(async function main() {
  console.log('仓库 ' + REPO + ' · 分支 ' + BRANCH + (PULL ? ' · 模式：拉取' : ' · 模式：只检查'));
  console.log('');
  let pending = 0, changed = 0;
  for (const f of FILES) {
    const abs = path.join(DIR, f);
    const exists = fs.existsSync(abs);
    const localMs = exists ? Math.round(fs.statSync(abs).mtimeMs) : 0;
    let rt;
    try { rt = await remoteTime(f); } catch (e) { rt = { ms: 0, note: e.message }; }
    const tag = (exists ? '' : '本地缺文件 ');
    let verdict;
    if (!exists) { verdict = '本地没有 → 需要拉取'; pending++; }
    else if (!rt.ms) { verdict = '远端查不到时间（' + (rt.note || '') + '）→ 无法判断'; }
    else if (rt.ms > localMs + 60000) { verdict = '⚠️ 远端更新 → 应拉取，否则发布会覆盖掉组里的修改'; pending++; }
    else { verdict = '✓ 本地不旧于远端'; }

    console.log('· ' + f);
    console.log('    本地 ' + fmt(localMs) + ' · ' + (exists ? fs.statSync(abs).size + 'B' : '—')
      + ' | 远端 ' + fmt(rt.ms) + (rt.note ? ' (' + rt.note + ')' : ''));
    console.log('    ' + tag + verdict);

    const need = FORCE || !exists || (rt.ms && rt.ms > localMs + 60000);
    if (PULL && need) {
      try {
        const body = await raw(f);
        if (exists) fs.writeFileSync(abs + '.prev', fs.readFileSync(abs));
        fs.writeFileSync(abs, body, 'utf8');
        console.log('    → 已用远端覆盖本地' + (exists ? '（原文件存为 ' + f + '.prev）' : ''));
        changed++;
      } catch (e) {
        console.log('    → 覆盖失败：' + e.message);
      }
    }
    console.log('');
  }
  if (!PULL) {
    console.log(pending
      ? '有 ' + pending + ' 个数据文件远端更新。确认要在本机发布前同步：node tools/pull-remote-data.js --pull'
      : '数据文件两边一致，可以直接发布。');
  } else {
    console.log(changed ? ('已更新 ' + changed + ' 个文件，接着跑 node tools/train_lm.js --auto 再发布。')
      : '没有需要拉取的文件。');
  }
  process.exitCode = pending && !PULL ? 2 : 0;
})().catch((e) => {
  console.error('出错：' + (e && e.message ? e.message : e));
  process.exitCode = 1;
});
