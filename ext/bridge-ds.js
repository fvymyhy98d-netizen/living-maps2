/* 活地图 · DeepSeek 桥 —— DeepSeek 这一侧（注入到 chat.deepseek.com）
   收到问题 → 填进输入框 → 点发送 → 盯着最后一条回答，稳定后把原文送回活地图。
   ⚠ 需要你在同一个浏览器里已登录 chat.deepseek.com（扩展不碰你的账号/密码/Key）。 */
(function () {
  const CH = 'lmds';
  const log = function () { try { console.log.apply(console, ['[活地图桥]'].concat([].slice.call(arguments))); } catch (e) { /* noop */ } };

  /* ---------- 找输入框（DeepSeek 改版时按顺序兜底） ---------- */
  function findEditor() {
    const sels = [
      'textarea#chat-input',
      'textarea[placeholder]',
      'div[contenteditable="true"]',
      '[contenteditable="true"]',
      'textarea'
    ];
    for (let i = 0; i < sels.length; i++) {
      const el = document.querySelector(sels[i]);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  /* ---------- 写进输入框（React 受控组件必须用原生 setter + input 事件） ---------- */
  function setText(el, text) {
    el.focus();
    if (el.tagName === 'TEXTAREA') {
      const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
      if (desc && desc.set) desc.set.call(el, text); else el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      el.textContent = '';
      const lines = String(text).split('\n');
      lines.forEach(function (ln, i) {
        if (i) el.appendChild(document.createElement('br'));
        el.appendChild(document.createTextNode(ln));
      });
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
    }
  }

  /* ---------- 找发送按钮 ---------- */
  function findSend() {
    const sels = [
      'button[aria-label*="发送"]', 'button[aria-label*="Send"]',
      'div[role="button"][aria-label*="发送"]', 'div[role="button"][aria-label*="Send"]',
      'button[type="submit"]'
    ];
    for (let i = 0; i < sels.length; i++) {
      const el = document.querySelector(sels[i]);
      if (el && !el.disabled) return el;
    }
    const btns = Array.prototype.slice.call(document.querySelectorAll('button, div[role="button"]'))
      .filter(function (b) { return b && b.offsetParent !== null; });
    return btns.length ? btns[btns.length - 1] : null;
  }

  /* ---------- 读最后一条回答 ---------- */
  function lastAnswer() {
    const sels = ['.ds-markdown', '[class*="ds-markdown"]', '[class*="markdown"]'];
    for (let i = 0; i < sels.length; i++) {
      const list = document.querySelectorAll(sels[i]);
      if (list.length) {
        const t = (list[list.length - 1].innerText || '').trim();
        if (t) return t;
      }
    }
    return '';
  }

  let busy = false;

  function ask(text) {
    if (busy) return log('上一次还没结束，忽略');
    const ed = findEditor();
    if (!ed) {
      chrome.runtime.sendMessage({ ch: CH, type: 'reply', text: '⚠️ 活地图桥：没找到 DeepSeek 的输入框（可能未登录或页面改版）。请在 chat.deepseek.com 登录后重试。' });
      return;
    }
    busy = true;
    const before = lastAnswer();
    setText(ed, text);
    setTimeout(function () {
      const btn = findSend();
      if (btn) btn.click(); else ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      log('已发送，等待回答…');

      /* 每 900ms 看一次：内容出现且连续两次不变 → 认为答完了 */
      let last = '', stable = 0, ticks = 0;
      const timer = setInterval(function () {
        ticks++;
        const now = lastAnswer();
        if (now && now !== before) {
          if (now === last) stable++; else { stable = 0; last = now; }
          if (stable >= 2) {
            clearInterval(timer);
            busy = false;
            chrome.runtime.sendMessage({ ch: CH, type: 'reply', text: now });
            log('已把回答送回活地图（' + now.length + ' 字）');
            return;
          }
        }
        if (ticks > 200) {           /* 最多等 ~3 分钟 */
          clearInterval(timer);
          busy = false;
          chrome.runtime.sendMessage({ ch: CH, type: 'reply', text: last ? last : '⚠️ 活地图桥：等了 3 分钟没等到 DeepSeek 的回答（可能网络慢或需要人机验证）。' });
        }
      }, 900);
    }, 350);
  }

  chrome.runtime.onMessage.addListener(function (m) {
    if (m && m.ch === CH && m.type === 'ask') ask(String(m.text || ''));
  });

  log('已就绪（在这个标签页里等活地图的问题）');
})();
