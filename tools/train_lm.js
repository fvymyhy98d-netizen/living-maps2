#!/usr/bin/env node
/* ★ 修复112：在**本站语料**上训练一个字符级 n-gram 语言模型（纯 Node，无需 Python/GPU）
 *
 * 它只做两件"安全活"，永远不生成答案文字：
 *   ① 给 BM25 的候选句子重排（只改先后，不改字）
 *   ② 把问句里"站内词表没有的英文词"映射到站内最接近的词（纠错）
 *
 * 用法：
 *   node tools/train_lm.js          # 默认 3-gram，自动裁剪到 <380KB
 *   node tools/train_lm.js 4        # 4-gram（更大更慢，一般不必）
 * 产物：data/lm.json
 */
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..');
const ai = require(path.join(DIR, 'js/ai.js'));
const LMLM = require(path.join(DIR, 'js/lm.js'));   /* ★ 修复115：训练完立刻用运行时打分，给出可量化的困惑度 */

const MAX_BYTES = 900 * 1024;   /* ★ 修复113：上限放大（模型"大一点"）；页面仍只在打开面板时懒加载 */

/* ★ 修复113：--check —— 只比对"语料变没变"，不重训。改了内容后用它可以一眼看出 lm.json 是否过期 */
function checkOnly() {
  const text = corpus();
  const file = path.join(DIR, 'data/lm.json');
  if (!fs.existsSync(file)) { console.log('✗ 还没有 data/lm.json —— 先跑 node tools/train_lm.js'); return 1; }
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (j.chars === text.length) { console.log('✓ 已同步（语料 ' + text.length + ' 字 · 模型 ' + j.order + '-gram）'); return 0; }
  console.log('✗ 语料变了：模型记的是 ' + j.chars + ' 字，现在 ' + text.length + ' 字 → 建议重训 node tools/train_lm.js');
  return 2;
}


function corpus() {
  const file = path.join(DIR, 'data/content.js');
  if (!fs.existsSync(file)) throw new Error('找不到 data/content.js');
  const src = fs.readFileSync(file, 'utf8');
  const win = {};
  try { new Function('window', 'var module={};' + src)(win); } catch (e) {
    throw new Error('data/content.js 解析失败：' + e.message);
  }
  const pages = (win.SITE_CONTENT && win.SITE_CONTENT.pages) || [];
  return pages.map(function (p) { return ai.pageText(p); }).join('\n');
}

/* 统计 k=1..order 的字符上下文 → { 下一个字符: 次数 } */
function count(text, order) {
  const ctx = [];
  for (let k = 1; k <= order; k++) ctx[k] = {};
  for (let i = 1; i < text.length; i++) {
    for (let k = 1; k <= order; k++) {
      if (i - k < 0) break;
      const key = text.slice(i - k, i);
      const row = (ctx[k][key] = ctx[k][key] || {});
      row[text[i]] = (row[text[i]] || 0) + 1;
    }
  }
  return ctx;
}

/* 裁剪：丢掉出现太少的上下文/字符，每个上下文最多留 cap 个后继
   ★ 修复115：**一元（k=1）不裁剪** —— 以前连单字后继也被砍到 8 个，
   结果大量字根本查不到概率、全部落到 FLOOR 惩罚（困惑度 5780，毫无意义）。
   一元表很小（每个字一行），全留既省不了多少体积，又能保证"任何字都有概率"。 */
function prune(ctx, order, minC, cap) {
  const out = {};
  for (let k = 1; k <= order; k++) {
    const src = ctx[k] || {};
    out[k] = {};
    Object.keys(src).forEach(function (key) {
      const row = src[key];
      const chars = (k === 1)
        ? Object.keys(row)
        : Object.keys(row).filter(function (c) { return row[c] >= minC; });
      if (!chars.length) return;
      chars.sort(function (a, b) { return row[b] - row[a]; });
      const o = {};
      chars.slice(0, k === 1 ? chars.length : cap).forEach(function (c) { o[c] = row[c]; });
      out[k][key] = o;
    });
  }
  return out;
}

function bytesOf(order, grams, chars) {
  return Buffer.byteLength(JSON.stringify({ order: order, chars: chars, grams: grams }), 'utf8');
}

function main() {
  const t0 = Date.now();
  const order = Math.max(1, Math.min(5, parseInt(process.argv[2], 10) || 4));
  const text = corpus();
  if (text.length < 500) throw new Error('语料太小（' + text.length + ' 字），先多写几页');
  const raw = count(text, order);

  let grams = null, bytes = 0, minC = 2, cap = 8, guard = 0;
  for (;;) {
    grams = prune(raw, order, minC, cap);
    bytes = bytesOf(order, grams, text.length);
    if (bytes <= MAX_BYTES || ++guard > 40) break;
    if (minC < 10) minC++;
    else if (cap > 2) cap--;
    else break;
  }

  let entries = 0, contexts = 0;
  for (let k = 1; k <= order; k++) {
    Object.keys(grams[k]).forEach(function (key) { contexts++; entries += Object.keys(grams[k][key]).length; });
  }

  const outFile = path.join(DIR, 'data/lm.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ order: order, chars: text.length, grams: grams }), 'utf8');
  console.log('语料 ' + text.length + ' 字 · ' + order + '-gram · 上下文 ' + contexts + ' 个 · 条目 ' + entries);
  console.log('裁剪参数 minCount=' + minC + ' cap=' + cap + ' · 产物 ' + (bytes / 1024).toFixed(1) + ' KB → data/lm.json');
  /* ★ 修复115：给出可量化的质量指标（困惑度越低越"像站里的话"）+ 耗时，方便你判断这次改动值不值 */
  LMLM.fromJSON({ order: order, chars: text.length, grams: grams });
  const ppl = function (s) { return s.length >= 2 ? Math.exp(-LMLM.logp(s)) : 0; };
  const holdN = Math.min(400, Math.floor(text.length * 0.15));
  const hold = holdN >= 40 ? text.slice(-holdN) : '';
  console.log('困惑度：全量 ' + ppl(text).toFixed(2)
    + (hold ? ' · 留出尾段 ' + ppl(hold).toFixed(2) + '（该段也参与了训练，数字偏乐观）' : '')
    + ' · 耗时 ' + (Date.now() - t0) + ' ms');
}

module.exports = { corpus: corpus, checkOnly: checkOnly, main: main };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.indexOf('--check') >= 0) {
    process.exitCode = checkOnly();
  } else if (args.indexOf('--auto') >= 0) {
    /* ★ 修复115：--auto —— 只有"没产物 / 语料变了"才重训 */
    const r = checkOnly();
    if (r === 0) console.log('→ 已同步，跳过训练。');
    else main();
  } else {
    main();
  }
}
