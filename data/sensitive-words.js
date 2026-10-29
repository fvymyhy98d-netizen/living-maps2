/* data/sensitive-words.js — 站点敏感词库（当前为空 = 拦截功能未启用）
   启用方法：把任何“一行一词”的词库文本文件保存为 data/raw-sensitive.txt，
   然后在项目根目录运行：node build_words.js
   —— 本文件会被自动重新生成（词条内容不会出现在任何对话里）。 */
window.LM_SENSITIVE_WORDS = [];