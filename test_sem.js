/* ★ 修复164：语义层回归测试（独立跑，不塞进 40 万行的 test_yjs.js）
 *   node test_sem.js
 * 覆盖：训练产物 / 完整词 / 关键词不再碎片 / 相关条目语义化 /
 *       换个说法也能召回 / 答案仍逐字出自原文 / 语义层缺失时整层降级
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const DIR = __dirname;
let pass = 0, fail = 0;
function T(name, ok, extra) {
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

const ai = require(path.join(DIR, 'js/ai.js'));
const contentSrc = fs.readFileSync(path.join(DIR, 'data/content.js'), 'utf8');
const win = {};
new Function('window', 'var module={};' + contentSrc)(win);
const pages = win.SITE_CONTENT.pages;
const ix = ai.buildIndex(pages);
const text = pages.map(function (p) { return ai.pageText(p); }).join('\n');
const semPath = path.join(DIR, 'data/sem.json');
const payload = JSON.parse(fs.readFileSync(semPath, 'utf8'));

/* ---------- 1. 训练产物 ---------- */
console.log('\n[1] 训练产物');
T('data/sem.json 存在且 < 600KB', fs.statSync(semPath).size < 600 * 1024);
T('chars 与当前语料一致', payload.chars === text.length,
  'sem=' + payload.chars + ' corpus=' + text.length);
T('CLI --check 返回 0（两个模型都同步）', (function () {
  try { execFileSync(process.execPath, ['tools/train_lm.js', '--check'], { cwd: DIR, stdio: 'pipe' }); return true; }
  catch (e) { return e.status === 0; }
})());
T('词表 / 概念关联 / 页面主题都非空',
  payload.words.length > 200 && Object.keys(payload.rel).length > 100
  && Object.keys(payload.topics).length === pages.length,
  'words=' + payload.words.length + ' rel=' + Object.keys(payload.rel).length);
T('CLI 与网页重训共用 js/sem.js', fs.readFileSync(path.join(DIR, 'tools/train_lm.js'), 'utf8')
  .indexOf("require(path.join(DIR, 'js/sem.js'))") > 0);
T('index.html 已引入 sem.js 且 ai/app/editor 版本已升',
  (function () {
    const h = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    return /js\/sem\.js\?v=\d+/.test(h) && /js\/ai\.js\?v=169/.test(h)
      && /js\/app\.js\?v=169/.test(h) && /js\/editor\.js\?v=169/.test(h);
  })());

/* ---------- 2. 词质量 ---------- */
console.log('\n[2] 词表质量');
const SEM = require(path.join(DIR, 'js/sem.js'));
['大语言模型', '预训练', '注意力', '语料', '参数', '梯度', '数据集'].forEach(function (w) {
  T('挖到完整词「' + w + '」', payload.words.indexOf(w) >= 0);
});
T('截图里的碎片词全部被过滤',
  ['样核', '工有', '或分', '改了'].every(function (w) { return payload.words.indexOf(w) < 0; }));
T('词表里没有纯数字和整句标题',
  payload.words.every(function (w) { return !/^\d+$/.test(w) && w.length <= 8 && /[\u4e00-\u9fa5]/.test(w); }));

/* ---------- 3. 降级（语义层没加载时，一切照旧） ---------- */
console.log('\n[3] 未加载语义层：整层降级');
T('require 后未 fromJSON 时 ready() = false', !SEM.ready());
const oldKw = ai.keywords(ix, 'feedback', 8);
T('关键词仍走原 2-gram 逻辑（可复现旧行为）', oldKw.indexOf('样核') >= 0, oldKw.join('/'));
const oldRel = ai.related(ix, 'feedback', 3);
T('相关条目仍走原余弦逻辑', oldRel.length === 3 && oldRel[0].id === 'discuss',
  JSON.stringify(oldRel.map(function (x) { return x.id; })));

/* ---------- 4. 加载后：展示明显变好 ---------- */
console.log('\n[4] 加载语义层后');
SEM.fromJSON(payload);
T('ready() = true', SEM.ready());
T('info() 报出词数 / 关联数 / 页数', (function () {
  const i = SEM.info(); return i && i.words > 200 && i.rel > 100 && i.pages === pages.length;
})());
const newKw = ai.keywords(ix, 'feedback', 8);
T('反馈页关键词不再是碎片', newKw.length > 0 && newKw.every(function (w) {
  return ['样核', '工有', '或分', '改了'].indexOf(w) < 0 && w.length >= 2;
}), newKw.join(' / '));
T('反馈页关键词含完整页名「反馈与建议」', newKw.indexOf('反馈与建议') >= 0, newKw.join(' / '));
const newRel = ai.related(ix, 'feedback', 3);
T('相关条目改为页面主题相似度，且首条仍是讨论区',
  newRel.length > 0 && newRel[0].id === 'discuss' && newRel[0].score > 0.2,
  newRel.map(function (x) { return x.label + ' ' + Math.round(x.score * 100) + '%'; }).join(' | '));
T('领域地图关键词是专业词而非碎片', (function () {
  const k = ai.keywords(ix, 'domain', 8);
  return k.some(function (w) { return ['大语言模型', '预训练', '定规模'].indexOf(w) >= 0; });
})(), ai.keywords(ix, 'domain', 8).join(' / '));

/* ---------- 5. 问答：换个说法也能召回 ---------- */
console.log('\n[5] 问答召回');
const qs = ['模型怎么变聪明', '训练要喂多少东西', '显卡和算力有什么关系',
  '反馈怎么提交', '预训练到底在做什么', '怎么判断回答靠不靠谱'];
const after = qs.map(function (q) { return ai.askSmart(ix, q, 3).length; });
T('六个口语化问句全部有答案（原来 4 个零命中）',
  after.every(function (n) { return n > 0; }), JSON.stringify(after));
T('概念扩展确实补出了站内相关词',
  SEM.expandWords('训练要喂多少东西', 6).length > 0,
  SEM.expandWords('训练要喂多少东西', 6).join(','));
T('cut() 把中文切成完整词而不是相邻两字',
  SEM.cut('大语言模型的预训练需要多少语料').indexOf('大语言模型') >= 0,
  SEM.cut('大语言模型的预训练需要多少语料').join(','));

/* ---------- 6. 防瞎编硬闸门 ---------- */
console.log('\n[6] 防瞎编');
const norm = function (s) { return String(s).replace(/\s+/g, '').replace(/[，,。；;：:、]/g, ''); };
const all = pages.map(function (p) { return norm(ai.pageText(p)); }).join('');
let tot = 0, bad = 0;
qs.concat(['数据从哪来', '注意力是怎么算的', '这块板子长什么样']).forEach(function (q) {
  ai.askSmart(ix, q, 3).forEach(function (r) {
    (r.used || []).forEach(function (u) { tot++; if (all.indexOf(norm(u.text)) < 0) bad++; });
  });
});
T('所有引文逐字出自站内原文', bad === 0, '共 ' + tot + ' 条，非原文 ' + bad + ' 条');
T('语义层不提供任何生成文字的接口',
  typeof SEM.build === 'function' && !('generate' in SEM) && !('answer' in SEM));

console.log('\n结果：' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
