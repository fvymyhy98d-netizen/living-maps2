#!/usr/bin/env node
/* ★ 修复112：在**本站语料**上训练一个字符级 n-gram 语言模型（纯 Node，无需 Python/GPU）
 *
 * 它只做两件"安全活"，永远不生成答案文字：
 *   ① 给 BM25 的候选句子重排（只改先后，不改字）
 *   ② 把问句里"站内词表没有的英文词"映射到站内最接近的词（纠错）
 *
 * ★ 修复164：同一次训练还会产出**语义层** data/sem.json ——
 *   无监督新词发现（完整词）+ 概念共现关联表 + 页面主题向量。
 *   它让关键词是「大语言模型」而不是「样核」，让换了个说法的提问也能召回原文。
 *
 * 用法：
 *   node tools/train_lm.js          # 默认 4-gram，自动裁剪
 *   node tools/train_lm.js 4        # 显式指定 4-gram
 * 产物：data/lm.json（字符 n-gram） + data/sem.json（语义层）
 */
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..');
const ai = require(path.join(DIR, 'js/ai.js'));
const LMLM = require(path.join(DIR, 'js/lm.js'));   /* ★ 修复115：训练完立刻用运行时打分，给出可量化的困惑度 */
const LMSE = require(path.join(DIR, 'js/sem.js'));  /* ★ 修复164：语义层（与网页重训按钮共用 build） */

const MAX_BYTES = LMLM.MAX_BYTES;   /* ★ 修复145：体积上限只有一份定义（js/lm.js） */

/* ★ 修复113：--check —— 只比对"语料变没变"，不重训。改了内容后用它可以一眼看出 lm.json 是否过期 */
function checkOnly() {
  const text = corpus();
  const file = path.join(DIR, 'data/lm.json');
  const semFile = path.join(DIR, 'data/sem.json');
  if (!fs.existsSync(file)) { console.log('✗ 还没有 data/lm.json —— 先跑 node tools/train_lm.js'); return 1; }
  if (!fs.existsSync(semFile)) { console.log('✗ 还没有 data/sem.json（语义层）—— 先跑 node tools/train_lm.js'); return 1; }
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const s = JSON.parse(fs.readFileSync(semFile, 'utf8'));
  if (j.chars === text.length && s.chars === text.length) {
    console.log('✓ 已同步（语料 ' + text.length + ' 字 · ' + j.order + '-gram'
      + ' · 语义层 ' + (s.words || []).length + ' 词）');
    return 0;
  }
  console.log('✗ 语料变了：n-gram 记 ' + j.chars + ' 字 / 语义层记 ' + s.chars
    + ' 字，现在 ' + text.length + ' 字 → 建议重训 node tools/train_lm.js');
  return 2;
}


function contentOf() {
  const file = path.join(DIR, 'data/content.js');
  if (!fs.existsSync(file)) throw new Error('找不到 data/content.js');
  const src = fs.readFileSync(file, 'utf8');
  const win = {};
  try { new Function('window', 'var module={};' + src)(win); } catch (e) {
    throw new Error('data/content.js 解析失败：' + e.message);
  }
  return (win.SITE_CONTENT && win.SITE_CONTENT.pages) || [];
}
function corpus() {
  return contentOf().map(function (p) { return ai.pageText(p); }).join('\n');
}

/* 统计 / 裁剪 / 体积计算都已搬到 js/lm.js（buildModel）—— 网页管理条「🧠 重训小模型」用的是同一份，
   这里不再重复实现，避免 CLI 与浏览器各训一套、慢慢漂移。 */

/* 裁剪参数说明留在 js/lm.js 的 pruneGrams里（★ 修复145 起只有一份实现）。 */

function main() {
  const t0 = Date.now();
  const order = Math.max(1, Math.min(5, parseInt(process.argv[2], 10) || 4));
  const text = corpus();
  /* ★ 修复145：训练算法统一走 js/lm.js 的 buildModel —— 网页管理条「🧠 重训小模型」
     调的是同一个函数，所以「命令行训的」和「网页点一下训的」产物逐字节一致。 */
  const r = LMLM.buildModel(text, order, MAX_BYTES);

  const outFile = path.join(DIR, 'data/lm.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(r.payload), 'utf8');
  console.log('语料 ' + r.chars + ' 字 · ' + r.order + '-gram · 上下文 ' + r.contexts + ' 个 · 条目 ' + r.entries);
  console.log('裁剪参数 minCount=' + r.minCount + ' cap=' + r.cap + ' · 产物 ' + (r.bytes / 1024).toFixed(1) + ' KB → data/lm.json');
  /* ★ 修复115：给出可量化的质量指标（困惑度越低越"像站里的话"）+ 耗时，方便你判断这次改动值不值 */
  LMLM.fromJSON(r.payload);
  const ppl = function (s) { return s.length >= 2 ? Math.exp(-LMLM.logp(s)) : 0; };
  const holdN = Math.min(400, Math.floor(text.length * 0.15));
  const hold = holdN >= 40 ? text.slice(-holdN) : '';
  console.log('困惑度：全量 ' + ppl(text).toFixed(2)
    + (hold ? ' · 留出尾段 ' + ppl(hold).toFixed(2) + '（该段也参与了训练，数字偏乐观）' : '')
    + ' · 耗时 ' + (Date.now() - t0) + ' ms');

  /* ★ 修复164：语义层 —— CLI 与网页「🧠 重训小模型」调的是同一个 LMSE.build，
     所以两边产出的 data/sem.json 逐字节一致，不会各训一套慢慢漂移。 */
  const sr = LMSE.build(text, contentOf());
  fs.writeFileSync(path.join(DIR, 'data/sem.json'), JSON.stringify(sr.payload), 'utf8');
  console.log('语义层：完整词 ' + sr.words + ' 个（内置词组 ' + sr.lexWords + ' · 英文术语 ' + sr.enWords
    + '） · 概念关联 ' + sr.relWords + ' 词 · 页面主题 ' + sr.topics + ' 页');
  console.log('词向量：' + sr.vecWords + ' 词 × ' + sr.vecDim + ' 维（int8 量化） · 共 '
    + (sr.bytes / 1024).toFixed(1) + ' KB → data/sem.json');
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
