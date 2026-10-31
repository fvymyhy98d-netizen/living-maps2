/* 活地图 · DeepSeek 桥 —— 网页这一侧的桥（注入到 living-maps2 页面）
   只做两件事：把页面 postMessage 的「问题」转给扩展后台；把后台送回来的「回答」交回页面。 */
(function () {
  const TAG = 'lm-ds-bridge', PAGE = 'lm-page';

  function tellPage(obj) {
    try { window.postMessage(obj, location.origin); } catch (e) { /* noop */ }
  }

  /* 页面 → 扩展 */
  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.ch !== PAGE) return;
    if (d.type === 'ping') { tellPage({ ch: TAG, type: 'hello' }); return; }
    if (d.type === 'ask') {
      try {
        chrome.runtime.sendMessage({ ch: 'lmds', type: 'ask', text: String(d.text || '') }, function (r) {
          if (r && r.ok) tellPage({ ch: TAG, type: 'ack' });
          else tellPage({ ch: TAG, type: 'ack', ok: false, why: (r && r.why) || 'no-deepseek-tab' });
        });
      } catch (err) {
        tellPage({ ch: TAG, type: 'ack', ok: false, why: 'extension-error' });
      }
    }
  });

  /* 扩展 → 页面 */
  chrome.runtime.onMessage.addListener(function (m) {
    if (m && m.ch === 'lmds' && m.type === 'reply') tellPage({ ch: TAG, type: 'reply', text: String(m.text || '') });
  });

  /* 主动打招呼（页面可能在监听之前就加载完了） */
  tellPage({ ch: TAG, type: 'hello' });
  let n = 0;
  const t = setInterval(function () {
    tellPage({ ch: TAG, type: 'hello' });
    if (++n > 30) clearInterval(t);
  }, 2000);
})();
