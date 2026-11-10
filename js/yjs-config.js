/* =========================================================
   yjs-config.js —— Yjs 实时协同配置（5 人左右 Mesh P2P 工程版）
   ▸ 信令：EMQX 公共 MQTT Broker（免费、匿名、免注册、国内直连）——只负责"牵线"
     （交换 WebRTC 握手），文档内容全部走设备间 P2P，不经过服务器。
     broker 池主备见下方 mqtt.brokers（传输层按房间哈希确定性选一台，同一房间天然同台）。
   ▸ 开通三步（README 三·补12）：①tcb.cloud.tencent.com 创建环境（记下「环境 ID」）
     ②身份认证 → 开启「匿名登录」 ③环境设置 →「Web 安全域名」加 localhost / 127.0.0.1 /
     你的.github.io 域名 —— 然后把环境 ID 填进下面 tcb.env，Ctrl+Shift+R 生效。
   ▸ TURN：★ 修复165 —— 免费 OpenRelay 公共 TURN 于 2026 年停服，已全部移除（详见下方
     iceServers 注释）；站点改为不依赖 TURN：STUN 直连 + MQTT 中继在线状态 + GitHub 轮询内容。
   ▸ STUN：Google / Twilio 公共 STUN（免费、无配额）。
   ▸ password：房间口令（防陌生人进房间；属拦截而非加密，内容级安全见 README）。
   ▸ 改完本文件无需改其他代码（改完 Ctrl+Shift+R 生效）。GitHub Pages 部署不受影响。
   ▸ 历史：曾用自建 Cloudflare Worker（workers.dev 被国内 DNS 污染弃用，README 三·补11）
     与腾讯 CloudBase realtime（体验版环境未开通 realtime 模块 → 503，README 三·补12），
     两条线路代码均已删除，现役线路为 EMQX 公共 MQTT。
   ========================================================= */
window.LMYJS_CONFIG = {
  enabled: true,
  room: 'living-maps-collab-v1',
  password: 'zju-lm-collab-2026',
  /* ▸ MQTT 信令：EMQX 公共 Broker 池（免费匿名，只传握手帧不传内容）。
     传输层按「房间哈希 % 池大小」确定性选一台——同一房间所有设备天然同台互通；
     池内为主备跨供应商（EMQX 中国 / EMQX 国际 / HiveMQ），主站故障时改池两端同步生效。 */
  mqtt: {
    brokers: [
      'wss://broker-cn.emqx.io:8084/mqtt',   /* 主：EMQX 公共 Broker 中国节点 */
      'wss://broker.emqx.io:8084/mqtt',      /* 备：EMQX 公共 Broker 国际节点 */
      'wss://broker.hivemq.com:8884/mqtt'    /* 备：HiveMQ 公共 Broker（不同供应商） */
    ]
  },
  /* 已弃用的 WebSocket 信令数组（y-webrtc 用）。保留字段避免旧版本报错，不再读取 */
  signaling: [],
  /* ★ 修复165（2026-11-10）：公共 TURN 已全线停用，站点改为「不依赖 TURN」
     本机真实 WebRTC ICE 收集实测（不是只看端口通不通）：
       · openrelay.metered.ca:80/443    → 免费 Open Relay 已停服（2026 起要求注册 API Key），域名无解析
       · standard.relay.metered.ca / staticauth.openrelay.metered.ca → 浏览器 DNS 解析失败(701)
       · turn.cloudflare.com:3478 / turn.speed.cloudflare.com:50000 → 端口通，但必须带用户名密码
       · speed.cloudflare.com/turn-creds → 403（只服务 Cloudflare 自家页面，第三方跨域拿不到）
       · turn.anyfirewall.com / turn.bistri.com → 连不上(701)
     所以「再换一个免费公共 TURN」仍会像组长说的那样过几天停掉、要重新激活。
     这里删光失效 TURN —— 它们每条都让 ICE 收集报一次 701，反而拖慢直连建立。
     留下的是实测能返回 srflx 公网反射地址的 STUN：同网段 / 普通家庭 NAT 可直连；
     跨严格 NAT 时内容走 GitHub 轮询（1–2s），「谁在线 / 正在改哪块」走 MQTT 中继（修复163），
     三台 broker（EMQX 中国 / EMQX 国际 / HiveMQ）均实测可达，不会 7 天失效。
     以后若拿到 TURN 账号（Metered 免费 20GB/月，或自建 coturn），把接口返回的
     iceServers 追加进下面数组即可，传输层代码一行都不用改。 */
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

