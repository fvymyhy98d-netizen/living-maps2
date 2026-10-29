/* build_words.js — 把下载的原始词库（data/raw-sensitive.txt）转换成站点词库 data/sensitive-words.js
   规矩：本脚本与它的输出都绝不打印任何词条内容，只输出统计数字。用完即可删除本脚本。 */
var fs = require('fs');
var SRC = 'data/raw-sensitive.txt', OUT = 'data/sensitive-words.js';
var raw = fs.readFileSync(SRC, 'utf8');
var seen = {}, list = [];
raw.split(/\r?\n/).forEach(function (line) {
  var w = line
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .trim();
  if (!w || w.length < 2 || w.length > 30) return;      /* 过短/过长丢弃（≤2 位词易误伤） */
  if (w.charAt(0) === '#' || w.charAt(0) === '/' || w.charAt(0) === ';') return; /* 注释行 */
  if (seen[w]) return;
  seen[w] = 1;
  list.push(w);
});
list.sort();
var js = '/* data/sensitive-words.js — 由 build_words.js 自动生成（现成开源词库转换），请勿手工编辑本文件 */\n'
  + '/* 词条内容查看/维护请直接编辑本文件或重新生成；网页端只在内存中使用，不会展示词表 */\n'
  + 'window.LM_SENSITIVE_WORDS = ' + JSON.stringify(list) + ';\n';
fs.writeFileSync(OUT, js, 'utf8');
console.log('BUILD-OK words=' + list.length + ' bytes=' + Buffer.byteLength(js) + ' -> ' + OUT);