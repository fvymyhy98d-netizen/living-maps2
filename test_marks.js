/* =========================================================
   test_marks.js —— md.js 行内标记回归（node test_marks.js）
   覆盖 lm_collab_v2 / 修复⑦ 引入的关键能力：
     1) [[j:ID,文字]] 跳转起点里可以带 **加粗** 等格式（md.js 先渲染格式再渲染跳转）
     2) @@gradN,文字@@ 行内渐变（表格单元格走同一渲染路径）
     3) 表格单元格字符串里的跳转 / 高亮 / 颜色都能渲染
     4) 颜色白名单：非法色值原样退回文字（防注入）
     5) 多个跳转同行互不吞并（非贪婪匹配）
   改 md.js 后必须重跑本文件 + node test_yield.js + node test_collab.js
   ========================================================= */
const { inlineFmt } = require('./js/md.js');
let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + '\n  got:  ' + got + '\n  want: ' + want); }
}
/* 1) 跳转内带加粗 */
eq('jump-with-bold',
  inlineFmt('[[j:J1,**核心**概念]]'),
  '<span class="jumplink" data-jump="J1"><strong>核心</strong>概念</span>');
/* 2) 行内渐变 */
eq('grad-inline', inlineFmt('@@grad1,渐变字@@'), '<span class="grad grad-1">渐变字</span>');
/* 3) 单元格场景：跳转里含颜色 + 高亮 */
eq('cell-jump-color',
  inlineFmt('[[j:J2,@@#f00,红@@字]]'),
  '<span class="jumplink" data-jump="J2"><span style="color:#f00">红</span>字</span>');
eq('cell-hl', inlineFmt('==重点=='), '<mark>重点</mark>');
eq('cell-color', inlineFmt('@@#0a0,绿@@'), '<span style="color:#0a0">绿</span>');
/* 4) 色值白名单：非法色值不生成彩色 span（原样保留为转义文本，防注入） */
const wl = inlineFmt('@@javascript:alert(1),x@@');
eq('color-whitelist', /<span style="color:javascript/.test(wl) ? 'INJECTED' : 'SAFE', 'SAFE');
eq('fontsize-mark', inlineFmt('@@28,大字@@'), '<span style="font-size:28px">大字</span>');
/* 5) 两个跳转同行（非贪婪） */
const two = inlineFmt('[[j:JA,甲]][[j:JB,乙]]');
eq('two-jumps', two,
  '<span class="jumplink" data-jump="JA">甲</span><span class="jumplink" data-jump="JB">乙</span>');
/* 6) 跳转内带渐变（嵌套两类标记） */
eq('jump-with-grad',
  inlineFmt('[[j:J3,@@grad2,漂移@@终点]]'),
  '<span class="jumplink" data-jump="J3"><span class="grad grad-2">漂移</span>终点</span>');
/* 7) 嵌套渲染（修复㉑）：md.js 循环替换（自内向外）—— 历史上被写坏的嵌套标记现在
   渲染为正确的层层包裹 span（外层套内层），不再是「只认内层、外层泄漏成乱码」。
   这同时让行内样式可以只作用于选中的那几个字（编辑器只包选区、不再外扩整段） */
eq('nest-grad-fs',
  inlineFmt('@@grad1,@@13,企业@@@@'),
  '<span class="grad grad-1"><span style="font-size:13px">企业</span></span>');
eq('nest-fs-grad',
  inlineFmt('@@13,@@grad1,企业@@@@'),
  '<span style="font-size:13px"><span class="grad grad-1">企业</span></span>');
/* 8) 高亮 == 内嵌套加粗：md.js 里加粗等先渲染、== 后渲染 —— 编辑器放宽「选区内完整标记
   共存」的前提就是这条渲染能力（选区跨加粗边界上高亮/颜色不再静默回退整段） */
eq('hl-with-bold',
  inlineFmt('==普通**加粗**普通=='),
  '<mark>普通<strong>加粗</strong>普通</mark>');
eq('nest-fs-color',
  inlineFmt('@@13,@@#f00,红@@字@@'),
  '<span style="font-size:13px"><span style="color:#f00">红</span>字</span>');
eq('nest-fs-color2',
  inlineFmt('@@#f00,@@#00f,世界@@@@'),
  '<span style="color:#f00"><span style="color:#00f">世界</span></span>');
eq('heal-lone-at', inlineFmt('企业@@@@'), '企业');
/* 8) 字号白名单：只认工具栏档位（13–40）。历史坏数据里被写坏的微小字号（如 @@9,x@@）
   渲染成普通文字 —— 字永远不会莫名变小；合法档位照常渲染。坏字号外层仍正常消耗 */
eq('fs-whitelist-small', inlineFmt('@@9,小字@@'), '小字');
eq('fs-whitelist-ok', inlineFmt('@@26,大字@@'), '<span style="font-size:26px">大字</span>');
eq('fs-whitelist-nested', inlineFmt('@@grad2,@@9,小字@@@@'), '<span class="grad grad-2">小字</span>');
/* 9) 行内字体（修复㉔）：@@f:key,文字@@ → data-lmf 字体 span（htmlToMd 按 data-lmf 还原，
   编辑往返不丢字体）；纯字母色值仍走颜色分支不被字体分支吞掉；字号套字体嵌套正常 */
eq('font-inline', inlineFmt('@@f:hei,黑体字@@'),
  "<span data-lmf=\"hei\" style=\"font-family:'Heiti SC','SimHei',sans-serif\">黑体字</span>");
eq('font-color-key-order', inlineFmt('@@red,红字@@'), '<span style="color:red">红字</span>');
eq('size-around-font', inlineFmt('@@22,@@f:hei,字@@@@'),
  "<span style=\"font-size:22px\"><span data-lmf=\"hei\" style=\"font-family:'Heiti SC','SimHei',sans-serif\">字</span></span>");
/* 10) 孤立 == 自愈（修复㉗）：历史坏数据里未配对的 == 不再泄漏成可见文字
   （「调完颜色前面出现个 = 号」——外层高亮嵌套错配的残骸，渲染兜底清掉） */
eq('heal-lone-hl', inlineFmt('具体==关系'), '具体关系');
eq('heal-lone-hl-bold', inlineFmt('讲清楚**具体==关系**'), '讲清楚<strong>具体关系</strong>');
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
