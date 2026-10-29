/* =========================================================
   test_hist.js —— 撤销历史去重回归（node test_hist.js）
   验证修复㉒：hPush / undo / redo 在比较快照前剥离协作时间戳 _ts，
   「一次操作 = 一步撤销」——加粗/字号后不再需要按两次撤回。
   ========================================================= */
'use strict';
const fs = require('fs');
let pass = 0, fail = 0;
function T(name, ok, extra) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? '\n  ' + extra : '')); }
}
const src = fs.readFileSync('js/app.js', 'utf8');
/* 提取 stripTsSnap 函数：顶层函数以「行首两空格 + }」结束（内部行缩进 ≥4 空格，
   且函数体里的正则字面量含 }，不能用花括号配平） */
const anchor = src.indexOf('function stripTsSnap');
if (anchor < 0) { console.error('FAIL: 无法从 js/app.js 提取 stripTsSnap'); process.exit(1); }
const mEnd = /\r?\n  \}/.exec(src.slice(anchor));
if (!mEnd) { console.error('FAIL: 找不到 stripTsSnap 结束'); process.exit(1); }
const stripTsSnap = eval('(' + src.slice(anchor, anchor + mEnd.index + mEnd[0].length) + ')');

/* 1) 顶层 _ts 被剥掉 */
T('top-level _ts stripped',
  stripTsSnap('{"pages":[],"_ts":1690000000000}') === '{"pages":[]}',
  stripTsSnap('{"pages":[],"_ts":1690000000000}'));
/* 2) 嵌套块里的 _ts 被剥掉（后写优先时间戳在 page.blocks[i] 上） */
T('nested _ts stripped',
  stripTsSnap('{"pages":[{"blocks":[{"text":"a","_ts":111},{"text":"b"}]}]}') ===
  '{"pages":[{"blocks":[{"text":"a"},{"text":"b"}]}]}',
  stripTsSnap('{"pages":[{"blocks":[{"text":"a","_ts":111},{"text":"b"}]}]}'));
/* 3) 开头的 _ts（后跟逗号）也被剥掉 */
T('leading _ts stripped',
  stripTsSnap('{"_ts":42,"a":1}') === '{"a":1}',
  stripTsSnap('{"_ts":42,"a":1}'));
/* 4) 字符串正文里的 "_ts":123 不被误伤（JSON 转义引号带反斜杠，正则不匹配） */
const raw = JSON.stringify({ t: '"_ts":123', _ts: 9 });
const stripped = stripTsSnap(raw);
T('escaped text untouched',
  stripped.indexOf('_ts\\":123') >= 0 && stripped.indexOf('"_ts":9') < 0,
  stripped);
/* 5) 仅 _ts 不同的两个快照 → 剥离后相等（hPush 去重 / undo 跳步的依据） */
const a = JSON.stringify({ pages: [{ id: 'p', blocks: [{ type: 'text', text: 'x' }] }] });
const b = JSON.stringify({ pages: [{ id: 'p', blocks: [{ type: 'text', text: 'x', _ts: Date.now() }] }] });
T('ts-only diff compares equal', stripTsSnap(a) === stripTsSnap(b));
/* 6) 内容真不同 → 剥离后仍不等（不会吞掉真实操作） */
const c = JSON.stringify({ pages: [{ id: 'p', blocks: [{ type: 'text', text: 'xy', _ts: 1 }] }] });
T('real diff still differs', stripTsSnap(a) !== stripTsSnap(c));
/* 7) 空入参安全 */
T('null/undefined safe', stripTsSnap(null) === '' && stripTsSnap(undefined) === '');
/* 8) 仅 nbsp↔空格 差异的快照 → 剥离后相等（修复㉔：失焦重序列化的空格噪声不再多记一步） */
const n1 = JSON.stringify({ pages: [{ id: 'p', blocks: [{ type: 'text', text: '高亮\u00A0词' }] }] });
const n2 = JSON.stringify({ pages: [{ id: 'p', blocks: [{ type: 'text', text: '高亮 词' }] }] });
T('nbsp-vs-space compares equal', stripTsSnap(n1) === stripTsSnap(n2));
/* 9) 真实内容差异仍不等（nbsp 归一不吞掉真改动） */
const n3 = JSON.stringify({ pages: [{ id: 'p', blocks: [{ type: 'text', text: '高亮词x' }] }] });
T('nbsp real diff still differs', stripTsSnap(n1) !== stripTsSnap(n3));

/* =========================================================
   修复㉕：撤销「假步骤」全类根治 —— 所有失焦保存路径都有「无变化不落盘」守卫
   （块字段修复㉔④已有；大标题/页面字段/Markdown源码框此前失焦必提交，重序列化
   只要有一丝不可见差异就多记一步 → 加粗/斜体后撤销要按两次）。源码级守护如下 */
const esrc = fs.readFileSync('js/editor.js', 'utf8');
T('focusout site-field guard (fix25)', /normTxt\(tgt\.o\[tgt\.k\]\) === txt/.test(esrc));
T('focusout page-field guard (fix25)', /normTxt\(page\[pgF\]\) === txt/.test(esrc));
T('focusout md-src guard (fix25)', /String\(b\.text == null \? '' : b\.text\) === String\(el\.value == null \? '' : el\.value\)/.test(esrc));
T('applyInline no-op never commits (fix25)', /if \(nt === t\) \{ refreshFmtState\(\); return true; \}/.test(esrc));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);