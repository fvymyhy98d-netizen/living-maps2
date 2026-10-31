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

const MAX_BYTES = 380 * 1024;   /* 产物上限：超过就继续裁剪（页面只在打开面板时才懒加载） */

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

/* 裁剪：丢掉出现太少的上下文/字符，每个上下文最多留 cap 个后继 */
function prune(ctx, order, minC, cap) {
  const out = {};
  for (let k = 1; k <= order; k++) {
    const src = ctx[k] || {};
    out[k] = {};
    Object.keys(src).forEach(function (key) {
      const row = src[key];
      const chars = Object.keys(row).filter(function (c) { return row[c] >= minC; });
      if (!chars.length) return;
      chars.sort(function (a, b) { return row[b] - row[a]; });
      const o = {};
      chars.slice(0, cap).forEach(function (c) { o[c] = row[c]; });
      out[k][key] = o;
    });
  }
  return out;
}

function bytesOf(order, grams, chars) {
  return Buffer.byteLength(JSON.stringify({ order: order, chars: chars, grams: grams }), 'utf8');
}

function main() {
  const order = Math.max(1, Math.min(5, parseInt(process.argv[2], 10) || 3));
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
}

main();
