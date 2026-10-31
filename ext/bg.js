/* 活地图 · DeepSeek 桥 —— 后台中继（MV3 service worker）
   网页标签页 ⇄ 这里 ⇄ chat.deepseek.com 标签页；两端都是扩展的 content script，
   所以可以跨域传递文字（网页自己做不到，这是同源策略决定的）。 */
const DS_URL = 'https://chat.deepseek.com/*';
const PAGE_URL = 'https://fvymyhy98d-netizen.github.io/living-maps2/*';

chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
  if (!msg || msg.ch !== 'lmds') return;

  /* ① 网页 → DeepSeek：找到已打开的 DeepSeek 标签页，把问题丢过去 */
  if (msg.type === 'ask') {
    chrome.tabs.query({ url: DS_URL }, function (list) {
      if (!list || !list.length) {
        reply({ ok: false, why: 'no-deepseek-tab' });   /* 网页那边会退回「复制 + 打开」的模式 */
        return;
      }
      chrome.tabs.sendMessage(list[0].id, { ch: 'lmds', type: 'ask', text: msg.text }, function () {
        /* ★ 修复118：DeepSeek 标签页是「装扩展之前」打开的、或刚刷新过 → content script 没注入，
           这里会报 lastError。以前无条件回 ok:true，网页就一直等一个永远不来的回答；
           现在回 ok:false，网页立刻退回「复制 + 打开」的兜底流程。 */
        if (chrome.runtime.lastError) {
          reply({ ok: false, why: 'inject-fail' });
          return;
        }
        reply({ ok: true, tabId: list[0].id });
      });
    });
    return true;                                        /* 异步回复 */
  }

  /* ② DeepSeek → 网页：把回答广播给活地图的标签页 */
  if (msg.type === 'reply') {
    chrome.tabs.query({ url: PAGE_URL }, function (list) {
      (list || []).forEach(function (t) {
        chrome.tabs.sendMessage(t.id, { ch: 'lmds', type: 'reply', text: msg.text });
      });
    });
  }
  return false;
});
