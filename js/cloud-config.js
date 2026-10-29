/* =========================================================
   云协同配置（lm_collab_v2 已实现「GitHub 仓库直存」云端通道，零新增配置）
   ── 现在的云端方案 ──
     · 管理员设备：用工具栏「☁ 同步」把 仓库名 + 分支 + Token 绑一次（Token 只存本会话），
       之后每次保存自动提交 data/content.js 到仓库（GitHub Pages 随之自动重新发布），
       并以 6~15 秒自适应轮询发现别人提交的新版本 → 自己电脑关机也能多人协同 ✓
     · 访客设备：在 GitHub Pages 上打开时，从网址自动推导 owner/repo（不用填任何东西），
       每 90 秒读一次仓库最新内容（只读，≤5 分钟级）——跨城市也能看到更新 ✓
     · 同一浏览器 / 同一 WiFi：分别由 BroadcastChannel / 课堂服务器(server.js) 实时兜底
   ── 将来换专业云数据库（LeanCloud / Supabase / Firebase）时 ──
     1) 云服务建一张共享表（如 lm_content），读写权限=登录可写
     2) 把 provider 改成 'leancloud'（或 'supabase' 等），填 url / key
     3) 在 collab.js 的传输层上接 SDK：远端变更回调里调 recv()，本地 publish() 时写云表
     4) 记得在 index.html 的 CSP connect-src 里把云服务域名加白
   ========================================================= */
window.LM_CLOUD = { provider: 'github', repo: 'data/content.js（由「☁ 同步」的仓库配置决定）', table: 'lm_content' };
