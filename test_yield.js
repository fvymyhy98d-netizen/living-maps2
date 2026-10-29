/* ═════════════════════════════════════════════════════════════════════
   🔒 YIELD-V4 拖拽让位 · 永久回归脚本（改让位相关代码后必须跑，须全部 PASS）
   直接从 js/app.js 源码提取 freeDecide 纯函数来测（测的就是发布代码）。
   场景：A 连续行程 / B 临界振荡不翻转 / C 底部对齐 / D 幂等不累积 /
        E 多框不叠加 / F 下行不回跳+上行单调 / G 阈值（图表低阈值/文字擦边）
   ═════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
function T(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' —— ' + detail : '')); }
}

/* --- 从源码提取 freeDecide（大括号配平） --- */
const src = fs.readFileSync(path.join(__dirname, 'js', 'app.js'), 'utf8');
const anchor = src.indexOf('var freeDecide = function');
const fnPos = anchor >= 0 ? src.indexOf('function', anchor) : -1;
let bi = fnPos >= 0 ? src.indexOf('{', fnPos) : -1, depth = 0, end = -1;
for (let i = bi; bi >= 0 && i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
if (end < 0) { console.error('FAIL: 无法从 js/app.js 提取 freeDecide'); process.exit(1); }
const freeDecide = eval('(' + src.slice(fnPos, end + 1) + ')');

/* --- 几何：3 个文档流块 + 全宽框（高120，GAP=16 → bot = top+136） --- */
const GAP = 16, BOXH = 120;
function mkFlows() {
  return [
    { natTop: 0, h: 200, left: 0, right: 800, type: 'text', m0: 0 },   // A
    { natTop: 216, h: 250, left: 0, right: 800, type: 'text', m0: 0 }, // B
    { natTop: 482, h: 300, left: 0, right: 800, type: 'text', m0: 0 }  // C
  ];
}
function box(top, prevIdx, left, right) {
  return { top: top, bot: top + BOXH + GAP,
    left: left === undefined ? 0 : left, right: right === undefined ? 800 : right,
    prevIdx: (prevIdx === undefined || prevIdx === null) ? -1 : prevIdx };
}

/* A/C/F：整程扫描 */
(function () {
  const F = mkFlows();
  const bad = [];
  let prev = -1, lastM = [0, 0, 0];
  for (let t = -160; t <= 900; t += 3) {
    const fd = box(t, prev);
    const r = freeDecide(F, [fd]);
    const hi = r.host[0];
    if (hi >= 0) {
      let acc = 0; for (let k = 0; k < hi; k++) acc += r.margins[k];
      if (r.margins[hi] > 0 && Math.abs(F[hi].natTop + acc + r.margins[hi] - fd.bot) > 1) bad.push('C@t' + t);
      if (r.margins[hi] < lastM[hi] - 1) bad.push('F@t' + t);
      if (prev >= 0 && hi < prev) bad.push('F2@t' + t);
      if (prev === hi && Math.abs(r.margins[hi] - lastM[hi]) > 6) bad.push('A@t' + t);
    }
    prev = hi; lastM = r.margins.slice();
  }
  const pick = p => bad.filter(s => s.startsWith(p)).slice(0, 3).join(' ');
  T('A 连续行程：同主块下让位量连续（步长3px → |Δ|≤6）', !bad.some(s => s.startsWith('A')), pick('A'));
  T('C 主块顶端始终对齐框下端（±1px）', !bad.some(s => s.startsWith('C')), pick('C'));
  T('F 下行 margin 不回跳、主块不倒退', !bad.some(s => s.startsWith('F')), pick('F'));
})();

/* B：临界线 ±8px 振荡 40 次 */
(function () {
  const F = mkFlows();
  const line = 200 - 24; /* A 启动线 = natBot - 24 = 176 */
  let prev = -1, lastHost = null, flips = 0, off = 0;
  for (let n = 0; n < 40; n++) {
    const t = line + (n % 2 ? 8 : -8);
    const fd = box(t, prev);
    const r = freeDecide(F, [fd]);
    if (lastHost !== null && r.host[0] !== lastHost) flips++;
    lastHost = r.host[0];
    if (r.host[0] === 0 && r.margins[0] > 0 && Math.abs(r.margins[0] - (t + BOXH + GAP)) > 1) off++;
    prev = r.host[0];
  }
  T('B 临界 ±8px×40 主块至多翻转1次（启动后恒定）', flips <= 1, 'flips=' + flips);
  T('B 启动后 margin 逐帧贴合框位置（±1px，不粘滞不超调）', off === 0, 'off=' + off);
})();

/* D：静止 50 帧输出恒定（绝对量重算，绝不累积） */
(function () {
  const F = mkFlows();
  const fd = box(400, 0);
  const r0 = freeDecide(F, [fd]);
  let same = true;
  for (let n = 0; n < 50; n++) {
    const r = freeDecide(F, [fd]);
    if (r.margins.join() !== r0.margins.join() || r.host.join() !== r0.host.join()) same = false;
  }
  T('D 静止 50 帧输出恒定（不累积）', same, JSON.stringify(r0));
})();

/* E：两个框各推各的、已推块不叠加 */
(function () {
  const r = freeDecide(mkFlows(), [box(100, -1), box(500, -1)]);
  T('E 多框不叠加（A=236 一次到位；B 顺延被推 184）',
    r.margins[0] === 236 && r.margins[1] === 184 && r.host[0] === 0 && r.host[1] === 1,
    JSON.stringify(r));
})();

/* F2：上行整程 —— 同主块 margin 单调不增；换主块只允许向更早的块接手 */
(function () {
  const F = mkFlows();
  const bad = [];
  const warm = freeDecide(F, [box(600, -1)]); /* 热身帧：t=600 的真实主块与推量 */
  let prev = warm.host[0], lastM = warm.margins.slice();
  for (let t = 600; t >= -100; t -= 3) {
    const r = freeDecide(F, [box(t, prev)]);
    const hi = r.host[0];
    if (hi === prev) {
      for (let k = 0; k < 3; k++) if (r.margins[k] > lastM[k] + 1) bad.push('滞留帧增@t' + t + '块' + k);
    } else if (hi > prev) {
      bad.push('上行主块倒退@t' + t + ':' + prev + '→' + hi);
    }
    prev = hi; lastM = r.margins.slice();
  }
  T('F2 上行整程：同主块 margin 单调不增，换主块只向前接手', bad.length === 0, bad.slice(0, 3).join(' '));
})();

/* G：图表低阈值 / 文字擦边不推 */
(function () {
  const r1 = freeDecide([{ natTop: 0, h: 200, left: 0, right: 800, type: 'chart', m0: 0 }], [box(150, -1, 700, 710)]);
  T('G1 图表水平压上 10px 即让位', r1.host[0] === 0 && r1.margins[0] === 286, JSON.stringify(r1));
  const r2 = freeDecide([{ natTop: 0, h: 200, left: 0, right: 800, type: 'text', m0: 0 }], [box(150, -1, 700, 710)]);
  T('G2 文字块擦边 10px 不推（<16px）', r2.host[0] === -1 && r2.margins[0] === 0, JSON.stringify(r2));
  const r3 = freeDecide(mkFlows(), [box(150, -1, 900, 1000)]);
  T('G3 无水平重叠不推任何块', r3.host[0] === -1 && r3.margins.join() === '0,0,0', JSON.stringify(r3));
})();

console.log(fail === 0
  ? 'YIELD-V4 PASS（A/B/C/D/E/F/G 全部通过）'
  : 'YIELD-V4 FAIL（' + fail + ' 项未过）');
process.exit(fail === 0 ? 0 : 1);