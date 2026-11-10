/* ★ 修复164：站内语义层（无监督新词发现 + 概念共现 + 页面主题）
 * ---------------------------------------------------------------------------
 * 为什么需要它：js/ai.js 的 tokens() 对中文是「相邻两字硬切」(2-gram)，
 *   「这样核对」→「样核」、「工具有」→「工有」。于是关键词全是碎片、相关条目靠字面重合、
 *   问答换个说法就一条都召回不到。字符 n-gram 模型只管重排/纠错，救不了这三件事。
 *
 * 这一层做的三件"基础语义"活（全部是统计，不生成任何文字、不接任何 API）：
 *   ① 从本站语料里**无监督挖出完整词**（凝固度 PMI + 左右邻字自由度），
 *      再加页面标题 / 块标题 / 条目名这些人工写好的结构化词 → 得到词典；
 *   ② 按"同一句里一起出现"统计词共现，算 PMI → 每个词有一张概念关联表；
 *   ③ 每页算 tf-idf 主题词 → 相关条目不再靠字面对齐。
 *
 * 产物 data/sem.json，由 tools/train_lm.js 训练时一起生成（网页「🧠 重训小模型」调同一份 build）。
 * 浏览器由 js/ai.js 在打开面板时懒加载；**加载不到就整层降级**，原来的 2-gram 逻辑一丁点不变。
 *
 * 硬规矩：本模块只输出「词 / 词表 / 分数」，绝不产出答案文字。
 *         语义召回只是把更多**原文句子**送进候选池，答案仍逐字来自站内原句。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LMSE = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}), function () {
  'use strict';

  const MAX_BYTES = 600 * 1024;
  let M = null;                 /* { v, chars, words, rel, topics, df, idf, nDoc, vec } */
  let cutMap = null;
  let enAlias = null;           /* 英文归一形式 → 词典里的真实写法 */
  let vecCache = null;          /* 解码后的 Float32Array 词向量（懒加载） */

  /* ---------------- 公共小工具 ---------------- */
  function isCn(ch) {
    if (!ch) return false;
    const c = ch.charCodeAt(0);
    return c >= 0x4e00 && c <= 0x9fa5;
  }
  function clean(s) {
    return String(s == null ? '' : s)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/==[^=,，]*?[,，]([\s\S]*?)==/g, '$1')
      .replace(/==([\s\S]*?)==/g, '$1')
      .replace(/@@[^@,，]*?[,，]([\s\S]*?)@@/g, '$1')
      .replace(/@@([\s\S]*?)@@/g, '$1')
      .replace(/\*\*([\s\S]*?)\*\*/g, '$1')
      .replace(/__([\s\S]*?)__/g, '$1')
      .replace(/~~([\s\S]*?)~~/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/[*_~`#>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  /* 虚词：既用于过滤候选词，也用于运行时分词降噪。
     注意这里只放"单字虚词 + 常见双字虚词"，专业词（如「模型」「语料」）一律不拦。 */
  const BAD_CHAR = {};
  ('的了和与及或在是有为以对从把被而也都就还又很更最会能可要让使这那我你他它其个种些不没如果'
    + '因为所以但是然后并且以及等等通过进行需要应该可能主要已经正在还有同时因此例如比如更加非常'
    + '目前现在时候方面问题内容这里那里什么怎么如何哪些可以一')
    .split('').forEach(function (c) { BAD_CHAR[c] = 1; });
  /* 只用于「关键词展示」的弱词：它们是合法词，但太通用，做成胶囊毫无信息量。
     词典和检索里仍然保留 —— 「处理」「记录」在回答问题时要用来召回原句。 */
  const WEAK_WORD = {};
  ('提出 处理 说清 互相 至少 参考 使用 需要 应该 可能 主要 已经 正在 还有 同时 例如 比如 '
    + '通过 进行 以及 其中 之后 之前 目前 现在 时候 这里 那里 期待 针对 遇到 知道 决定 选择 '
    + '支持 补充 全部 公开 位置 范围 多少 建议 说明 描述 独立 完整 直接 实际 自己 具体 '
    + '一些 一种 一个 这些 那些 不同 一样 这样 那样 相关 有关 之类 而已 部分 情况 方式'
  ).split(/\s+/).forEach(function (w) { if (w) WEAK_WORD[w] = 1; });
  /* 以这些字收尾的中文串几乎都是「被截断的更长词」（如「保留原」=「保留原判断」的一截） */
  const TAIL_BAD = /[原了着过在的和与或把被使让为以对从]$/;
  const BAD_WORD = {};
  ('我们 你们 他们 它们 这个 那个 这些 那些 什么 怎么 如何 因为 所以 但是 而且 如果 就是 可以 '
    + '一个 一种 一些 不是 没有 需要 应该 可能 主要 已经 正在 还有 同时 例如 比如 通过 进行 以及 '
    + '其中 之后 之前 目前 现在 时候 方面 问题 内容 这样 那样 这里 那里 等等 为什么 怎么办 什么样 '
    + '建议 提问 说明 描述 期待 针对 遇到 哪个 哪些 这些 那些 一种 一个 就是 而已 之类 有关 相关 '
    + '改了 用了 做了 说了 看了 写了 有了 是的 不是 也会 就会 都是 还有 只有 可以 能够'
  ).split(/\s+/).forEach(function (w) { if (w) BAD_WORD[w] = 1; });
  const EN_STOP = {};
  ('the a an and or but of to in on for with by as at from is are was were be been it its this that '
    + 'these those we you they he she not no can will would should could may might have has had do does '
    + 'did so such than then there here what which who whom how why when where if else about into over'
  ).split(/\s+/).forEach(function (w) { if (w) EN_STOP[w] = 1; });
  /* Markdown / 代码 / 链接里带进来的英文碎片，不是站内概念，不配进词表也不配占向量行 */
  const EN_NOISE = {};
  ('all need vs pad inf etc via img src href html div span http https www com org png jpg svg '
   + 'true false null undefined let var const return function hero face open want like '
   + 'see look read show try keep put give find get set run made take next last '
  ).split(/\s+/).forEach(function (w) { if (w) EN_NOISE[w] = 1; });

  /* ---------------- ★ 修复166：内置中文词组表 ----------------
     为什么不是"整部汉语词典"：静态站点要多几 MB，而 99% 的词在本站语料里
     永远不会出现，切出来只会把句子切碎。这里放的是「通用高频词组 + 本站主题词组」，
     补的正是无监督新词发现容易漏掉的普通词（凝固度不够但确实是词）。
     真正生僻的领域词（transformer / 监督微调 / 困惑度…）仍由 discover() 从语料里挖，
     结构化名称由 structWords() 收，三者合并才是完整词典。
     ★ 只有「在语料里真的出现过」的内置词才会进词典，不会凭空造词。 */
  const LEX_CN = (
    /* 通用名词 */ '方法 过程 结果 原因 目标 步骤 阶段 部分 整体 结构 功能 特点 区别 联系 关系 作用 影响 意义 价值 '
    + '条件 环境 情况 状态 水平 程度 数量 比例 范围 来源 依据 标准 原则 规则 方式 手段 途径 工具 材料 '
    + '资源 信息 数据 内容 形式 类型 种类 类别 层次 角度 方向 位置 时间 空间 顺序 流程 环节 节点 要点 '
    + '重点 难点 核心 关键 基础 前提 结论 观点 看法 理解 认识 判断 分析 比较 总结 归纳 推导 验证 检查 '
    + '测试 评估 选择 设计 构建 实现 完成 开始 结束 增加 减少 改变 调整 优化 改进 提高 降低 保持 产生 '
    + '形成 包含 包括 属于 等于 类似 相同 不同 相关 独立 共同 相互 直接 间接 简单 复杂 明确 清楚 具体 '
    + '详细 完整 准确 有效 可靠 稳定 快速 缓慢 主要 次要 常见 特殊 一般 通常 大概 几乎 完全 全部 局部 '
    + '优点 缺点 好处 坏处 困难 问题 办法 思路 逻辑 道理 例子 案例 事实 证据 概念 定义 含义 表达 描述 '
    + '能力 性能 效果 效率 成本 费用 价格 规模 大小 速度 精度 质量 风险 限制 前提 假设 推测 观察 记录 '
    + '系统 平台 项目 任务 计划 方案 成果 报告 资料 文献 文章 章节 段落 句子 词语 文字 语言 中文 英文 '
    + '表格 图片 图示 代码 程序 软件 硬件 网络 服务 接口 文件 目录 版本 记录 日志 快照 备份 恢复 '
    /* 学习与协作 */ + '老师 同学 学生 课程 作业 讲解 解释 练习 课堂 知识点 掌握 复习 查阅 笔记 教材 目录 小结 '
    + '思考 讨论 提问 回答 演示 展示 评分 要求 分工 合作 协作 组长 组员 设备 页面 网站 导航 条目 地图 '
    + '面包屑 链接 按钮 编辑器 反馈 留言 评论 讨论区 云端 本地 在线 离线 覆盖 冲突 合并 发布 部署 域名 '
    + '缓存 刷新 加载 渲染 关键词 相关条目 引用 参考 来源 更新记录 面板 窗口 小窗 回答 提问 建议 '
    /* 计算机 / AI 领域 */ + '模型 大模型 语言模型 大语言模型 人工智能 机器学习 神经网络 深度学习 训练 预训练 '
    + '微调 监督微调 对齐 指令 提示词 语料 训练数据 数据集 数据清洗 参数 权重 梯度 损失 损失函数 '
    + '注意力 自注意力 多头注意力 编码器 解码器 层数 维度 矩阵 向量 嵌入 词向量 语义 相似度 余弦 '
    + '分词 词表 词元 标记 序列 批次 迭代 轮次 优化器 学习率 反向传播 前向传播 过拟合 欠拟合 泛化 '
    + '蒸馏 量化 剪枝 推理 生成 检索 索引 召回 排序 重排 评估 指标 准确率 困惑度 概率 分布 采样 '
    + '归一化 标准化 初始化 收敛 计算 运算 浮点 字节 内存 显存 带宽 算力 显卡 芯片 电路板 处理器 '
    + '服务器 集群 中央处理器 图形处理器 电源 散热 主板 总线 晶体管 架构 流水线 并行 串行 调度 '
    + '算力 成本 能耗 吞吐量 延迟 并发 开源 论文 实验 复现 基准 对比 消融 结论 公式 推导 '
    + '检索增强 知识库 问答 对话 机器人 上下文 窗口 长文本 记忆 幻觉 瞎编 事实 可靠 可解释 '
    /* 提问常用词（口语→能落到站内概念） */ + '聪明 智能 厉害 强 弱 多少 几个 怎样 咋 为啥 用处 用途 干嘛 '
    + '花钱 烧钱 贵 便宜 电脑 机器 板子 喂 吃 跑 装 搭 做出来 造 学会 看懂 弄清楚 讲明白 '
  ).split(/\s+/).filter(Boolean);

  /* 英文词形归一：站内写 transformer，用户问 transformers / Transformer，都得落到同一个词。
     只做最常见的几种变形，不引入词库；拿不准就原样保留（还有向量兜底）。 */
  function enNorm(w) {
    let s = String(w || '').toLowerCase().replace(/[^a-z0-9+#._-]/g, '');
    if (s.length < 2) return '';
    if (EN_STOP[s]) return '';
    /* 统一复数与常见屈折，保留以 s/x/ch/sh 结尾但本身是术语的词（如 loss、analysis） */
    if (/^(gpus|cpus)$/.test(s)) return s.slice(0, -1);
    if (s.length > 4 && /ies$/.test(s)) s = s.slice(0, -3) + 'y';
    else if (s.length > 4 && /(ches|shes|xes|sses)$/.test(s)) s = s.slice(0, -2);
    else if (s.length > 3 && /s$/.test(s) && !/(ss|us|is|os|as)$/.test(s)) s = s.slice(0, -1);
    return s;
  }

  /* ★ 中英 / 口语概念桥：把「用户会问、但站内原句里没有」的说法，接到站内真实用词上。
     这不是生成答案，只是把查询词换成同义的检索词；答案仍逐字来自原句。
     词向量负责"语料里共现过"的软关联，这张表负责"共现也没学到"的硬关联。 */
  const BRIDGE = {
    'llm': ['大语言模型', '模型'], '大模型': ['大语言模型'], '语言模型': ['大语言模型'],
    'ai': ['人工智能', '模型'], '人工智能': ['模型'], '机器学习': ['训练', '模型'],
    'gpu': ['显卡', '算力'], '显卡': ['算力', '硬件'], 'cpu': ['处理器', '硬件'],
    'rag': ['检索增强', '检索'], '检索增强': ['检索', '知识库'],
    'attention': ['注意力'], 'transformer': ['注意力', '模型'],
    'token': ['分词', '词元'], '分词': ['词表'], 'embedding': ['向量', '嵌入'],
    '向量': ['嵌入', '相似度'], '权重': ['参数', '模型'], '参数': ['权重', '模型'],
    'pretrain': ['预训练', '训练'], '预训练': ['语料', '训练'],
    'finetune': ['微调', '训练'], '微调': ['训练', '指令'],
    'dataset': ['数据集', '语料'], '语料': ['数据集', '训练'],
    'inference': ['推理', '计算'], '推理': ['生成', '计算'],
    '聪明': ['智能', '能力', '效果'], '智能': ['能力', '模型'], '厉害': ['效果', '能力'],
    '多少钱': ['成本', '费用'], '贵': ['成本', '费用'], '烧钱': ['成本', '算力'],
    '价格': ['成本', '费用'], '花费': ['成本', '费用'],
    '喂': ['语料', '训练数据'], '吃': ['语料', '数据'],
    '板子': ['电路板', '显卡'], '电脑': ['硬件', '显卡'], '机器': ['硬件', '显卡'],
    '怎么学': ['方法', '步骤'], '看懂': ['理解', '解释'], '讲明白': ['解释', '说明'],
    '变强': ['优化', '改进'], '提升': ['提高', '改进'], '做出来': ['构建', '实现'],
    '造': ['构建', '实现'], '搭': ['构建', '部署'],
    '准不准': ['准确率', '评估'], '靠不靠谱': ['可靠', '评估'],
    '从哪来': ['来源', '数据集'], '哪里来': ['来源', '数据集'],
    '干什么': ['作用', '功能'], '干嘛': ['作用', '功能'],
    '长什么样': ['结构', '硬件'], '什么样': ['结构', '特点'],
    '几块': ['数量', '规模'], '多大': ['规模', '参数']
  };

  /* ★ 英文术语表：不塞整部英文词典，只从本站语料里收「出现过 ≥2 次」的英文词。
     于是 transformer / tokenizer / megatron-lm 这些站内真实写法都成为可检索的词，
     用户问 transformers（复数）也能经 enNorm 归一到 transformer。 */
  function enWords(text, minFreq) {
    const f = {};
    (String(text || '').toLowerCase().match(/[a-z][a-z0-9+#._-]{1,23}/g) || [])
      .forEach(function (w) {
        if (EN_STOP[w] || EN_NOISE[w]) return;
        const n = enNorm(w);
        if (n && n.length >= 3 && n.length <= 24) f[n] = (f[n] || 0) + 1;
      });
    return Object.keys(f).filter(function (w) { return f[w] >= (minFreq || 3); });
  }

  /* 确定性伪随机（Random Indexing 用）：同一台机器 / 不同设备训出的向量空间必须完全一致 */
  function hash32(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h | 0;
  }
  function randSigns(word, D, k) {
    const out = new Float64Array(D);
    let h = hash32(word);
    for (let i = 0; i < (k || 4); i++) {
      h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h |= 0;
      const d = (h >>> 0) % D;
      out[d] += ((h >>> 8) & 1) ? 1 : -1;
    }
    return out;
  }
  /* 纯 JS base64（Node 与浏览器通用，不依赖 Buffer / atob） */
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function b64encode(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 3) {
      const a = u8[i], b = i + 1 < u8.length ? u8[i + 1] : 0, c = i + 2 < u8.length ? u8[i + 2] : 0;
      s += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
      s += i + 1 < u8.length ? B64[((b & 15) << 2) | (c >> 6)] : '=';
      s += i + 2 < u8.length ? B64[c & 63] : '=';
    }
    return s;
  }
  function b64decode(str) {
    const s = String(str || '').replace(/[^A-Za-z0-9+/=]/g, '');
    const out = [], n = s.length;
    for (let i = 0; i < n; i += 4) {
      const a = B64.indexOf(s[i]), b = B64.indexOf(s[i + 1]);
      const c = s[i + 2] === '=' ? 0 : B64.indexOf(s[i + 2]);
      const d = s[i + 3] === '=' ? 0 : B64.indexOf(s[i + 3]);
      if (a < 0 || b < 0) break;
      out.push((a << 2) | (b >> 4));
      if (s[i + 2] !== '=') out.push(((b & 15) << 4) | (c >> 2));
      if (s[i + 3] !== '=') out.push(((c & 3) << 6) | d);
    }
    return new Uint8Array(out);
  }

  function utf8Bytes(s) {
    s = String(s == null ? '' : s);
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }
  function entropy(m) {
    let tot = 0;
    Object.keys(m).forEach(function (k) { tot += m[k]; });
    if (!tot) return 0;
    let h = 0;
    Object.keys(m).forEach(function (k) { const p = m[k] / tot; h -= p * Math.log(p); });
    return h;
  }

  /* ---------------- ① 无监督新词发现 ----------------
     凝固度：一个串若能拆成左右两半，且 P(whole) 远大于 P(left)P(right)，说明它是个词而非偶然拼接。
     自由度：左右邻字越丰富，越说明它能独立使用（不是更长词的一截）。 */
  function discover(text) {
    const runs = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    const freq = {};            /* 子串 → 次数（含长度 1，算 PMI 要用） */
    const left = {}, right = {};
    let total = 0;
    runs.forEach(function (run) {
      total += run.length;
      for (let i = 0; i < run.length; i++) {
        for (let L = 1; L <= 6 && i + L <= run.length; L++) {
          const w = run.substr(i, L);
          freq[w] = (freq[w] || 0) + 1;
          if (L >= 2) {
            (left[w] = left[w] || {})[i > 0 ? run.charAt(i - 1) : '^'] = ((left[w] || {})[i > 0 ? run.charAt(i - 1) : '^'] || 0) + 1;
            (right[w] = right[w] || {})[i + L < run.length ? run.charAt(i + L) : '$'] = ((right[w] || {})[i + L < run.length ? run.charAt(i + L) : '$'] || 0) + 1;
          }
        }
      }
    });
    const words = [];
    Object.keys(freq).forEach(function (w) {
      const L = w.length, f = freq[w];
      if (L < 2 || L > 6 || f < (L === 2 ? 4 : 3)) return;
      if (BAD_WORD[w] || TAIL_BAD.test(w) || BAD_CHAR[w.charAt(0)] || BAD_CHAR[w.charAt(L - 1)]) return;
      /* 虚词夹在中间也会产生大量假词（「的那就」之类）：整词里虚字占比过高就丢 */
      let bad = 0;
      for (let i = 0; i < L; i++) if (BAD_CHAR[w.charAt(i)]) bad++;
      if (bad / L > 0.5) return;
      /* 最小凝固度：所有切法里最弱的那一刀仍要够强 */
      let minPmi = Infinity;
      for (let i = 1; i < L; i++) {
        const a = w.slice(0, i), b = w.slice(i);
        const pmi = Math.log((f * total) / (freq[a] * freq[b] || 1));
        if (pmi < minPmi) minPmi = pmi;
      }
      const lh = entropy(left[w] || {}), rh = entropy(right[w] || {});
      const free = Math.min(lh, rh);
      if (minPmi < (L === 2 ? 3.0 : 2.2)) return;
      if (free < (L === 2 ? 1.0 : 0.7)) return;
      /* 得分：频次（对数）× 凝固度 × 自由度，用来在体积不够时优先保留好词 */
      words.push({ w: w, f: f, s: Math.log(1 + f) * minPmi * (0.5 + free) });
    });
    words.sort(function (a, b) { return b.s - a.s; });
    return words;
  }

  /* ② 结构化词：页面名 / 块标题 / 条目名是人工写的高质量词，强制进词典 */
  function structWords(pages) {
    const out = {};
    (pages || []).forEach(function (p) {
      const add = function (s) {
        clean(s).split(/[\s，,。；;、：:（）()\[\]【】|/!?？！"'“”·—\-]+/).forEach(function (x) {
          const w = x.replace(/[^\u4e00-\u9fa5a-zA-Z0-9+#._-]/g, '');
          /* 只收「2~8 字、含汉字、不是纯数字」的短名称。
             早先放宽到 12 字且不滤虚词，把「我们会怎么处理」这类整句标题塞进了词典，
             最大匹配分词就会切出怪词 —— 这正是要避免的。 */
          if (w.length < 2 || w.length > 8 || !/[\u4e00-\u9fa5]/.test(w)) return;
          if (/^\d+$/.test(w) || BAD_WORD[w]) return;
          if (TAIL_BAD.test(w) || BAD_CHAR[w.charAt(0)] || BAD_CHAR[w.charAt(w.length - 1)]) return;
          let bad = 0;
          for (let i = 0; i < w.length; i++) if (BAD_CHAR[w.charAt(i)]) bad++;
          if (bad / w.length > 0.34) return;
          out[w] = 1;
        });
      };
      add(p && p.label);
      ((p && p.blocks) || []).forEach(function (b) {
        if (!b) return;
        add(b.title);
        if (b.items && Array.isArray(b.items)) {
          b.items.forEach(function (it) {
            if (typeof it === 'string') add(it);
            else if (it) add(it.name || it.label || it.t || it.text);
          });
        }
        if (b.only && Array.isArray(b.only)) b.only.forEach(add);
      });
    });
    return Object.keys(out);
  }

  /* ③ 最大匹配分词（运行时也用同一份） */
  function buildCutMap(words) {
    const m = {}, max = {};
    words.forEach(function (w) {
      if (!isCn(w.charAt(0))) return;
      const c = w.charAt(0);
      (m[c] = m[c] || []).push(w);
      if (!max[c] || w.length > max[c]) max[c] = w.length;
    });
    Object.keys(m).forEach(function (c) { m[c].sort(function (a, b) { return b.length - a.length; }); });
    return { m: m, max: max };
  }
  function cut(text) {
    if (!cutMap) return [];
    const s = clean(String(text || '')).toLowerCase();
    const out = [];
    /* 英文词整取（≥2 且非停用词）；中文走最大匹配 */
    const parts = s.match(/[\u4e00-\u9fa5]+|[a-z][a-z0-9+#._-]*/g) || [];
    parts.forEach(function (part) {
      if (!isCn(part.charAt(0))) {
        const n = enNorm(part);
        if (!n) return;
        out.push(enAlias && enAlias[n] ? enAlias[n] : n);   /* 英文归一到站内写法 */
        return;
      }
      let i = 0;
      while (i < part.length) {
        const c = part.charAt(i);
        const list = cutMap.m[c];
        let hit = '';
        if (list) {
          const upto = Math.min(cutMap.max[c] || 2, part.length - i);
          for (let L = upto; L >= 2; L--) {
            const w = part.substr(i, L);
            /* list 已按长度降序，用 indexOf 足够（词表按首字母分组，通常几十条） */
            if (list.indexOf(w) >= 0) { hit = w; break; }
          }
        }
        if (hit) { out.push(hit); i += hit.length; }
        else i++;               /* 落单的字直接跳过：单字几乎都是噪声 */
      }
    });
    return out;
  }

  /* ---------------- ④ 概念共现 / 页面主题 ---------------- */
  function sentSplit(text) {
    return String(text || '')
      .split(/[。！？；!?;\n]|[，,、]{1,}(?=[^\s]{40,})/)
      .map(function (s) { return clean(s); })
      .filter(function (s) { return s.length >= 4; });
  }
  function buildRel(sents, words, dfDoc) {
    const co = {}, sentFreq = {};
    let n = 0;
    const valid = {};
    words.forEach(function (w) { valid[w] = 1; });
    sents.forEach(function (s) {
      const seen = {};
      cut(s).forEach(function (w) { if (valid[w]) seen[w] = 1; });
      const ws = Object.keys(seen);
      if (ws.length < 2) return;
      n++;
      ws.forEach(function (w) { sentFreq[w] = (sentFreq[w] || 0) + 1; });
      for (let i = 0; i < ws.length; i++) {
        for (let j = i + 1; j < ws.length; j++) {
          const a = ws[i] < ws[j] ? ws[i] : ws[j], b = ws[i] < ws[j] ? ws[j] : ws[i];
          (co[a] = co[a] || {})[b] = ((co[a] || {})[b] || 0) + 1;
          (co[b] = co[b] || {})[a] = ((co[b] || {})[a] || 0) + 1;
        }
      }
    });
    const rel = {};
    Object.keys(co).forEach(function (a) {
      /* 只把「全站每页都有」的词排除；「模型/训练」这类高频核心词恰恰最该有扩展表，
         否则用户最常问的词反而扩不出东西（早期 0.72 的阈值把它们全砍了）。 */
      if ((dfDoc[a] || 0) > 0.90 * (M && M.nDoc ? M.nDoc : 39)) return;
      const pa = (sentFreq[a] || 1) / Math.max(n, 1);
      const cand = [];
      Object.keys(co[a]).forEach(function (b) {
        const c = co[a][b];
        if (c < 2) return;
        const pb = (sentFreq[b] || 1) / Math.max(n, 1);
        const pmi = Math.log((c / Math.max(n, 1)) / (pa * pb));
        if (pmi <= 0.7) return;
        cand.push({ w: b, v: Math.min(1, pmi / 5) });
      });
      cand.sort(function (x, y) { return y.v - x.v; });
      if (cand.length) rel[a] = cand.slice(0, 8).map(function (x) { return [x.w, Math.round(x.v * 100) / 100]; });
    });
    return rel;
  }

  /* ---------------- ★ 修复166：英文归一表 + 词向量权重 ---------------- */
  /* 英文归一形式 → 词典里的真实写法。训练与运行时用同一份确定性算法重建，
     所以 sem.json 不用额外存这张表。 */
  function buildEnAlias(words) {
    const a = {};
    (words || []).forEach(function (w) {
      if (!w || isCn(w.charAt(0))) return;
      const base = enNorm(w);
      if (base) { a[base] = w; a[w.toLowerCase()] = w; }
    });
    return a;
  }

  /* Random Indexing 词向量：不做梯度下降，也能得到"语义相近的词向量相近"。
     做法：每个词 hash 出 D 维里 k 个 ±1 的**固定随机索引向量**（跨设备完全一致，
     不需要同步随机种子）；再把「同一句里出现过的其它词」的索引向量按 idf 累加给它。
     于是总在同一批句子里出现的词（显卡/算力/显存），向量自然靠近。
     最后 L2 归一 + int8 量化存盘，运行时解码成 Float32 做余弦，纯前端几十 KB。 */
  function buildVec(sents, words, idf, df, D, rel) {
    D = D || 128;
    const usable = words.filter(function (w) { return (df[w] || 0) >= 1; }).slice(0, 3000);
    const idx = {}, acc = {};
    usable.forEach(function (w) { idx[w] = randSigns(w, D, 4); acc[w] = new Float64Array(D); });
    /* ★ 用「滑动窗口」而不是整句：整句动辄上百词，几乎全站词都共现，学不出区分度。
       窗口 10 词、步长 5，才是词向量该看的局部上下文。 */
    const WIN = 10;
    (sents || []).forEach(function (s) {
      const seq = cut(s).filter(function (w) { return idx[w]; });
      for (let i = 0; i < seq.length; i += 5) {
        const win = seq.slice(i, i + WIN), uniq = {};
        win.forEach(function (w) { uniq[w] = 1; });
        const ws = Object.keys(uniq);
        if (ws.length < 2) continue;
        const ctx = new Float64Array(D), wt = {};
        ws.forEach(function (w) {
          const v = idx[w], g = Math.min(2.5, idf[w] || 0.5);
          wt[w] = g;
          for (let d = 0; d < D; d++) ctx[d] += v[d] * g;
        });
        ws.forEach(function (w) {
          const v = idx[w], a = acc[w], g = wt[w];
          for (let d = 0; d < D; d++) a[d] += ctx[d] - v[d] * g;   /* 去掉自己的贡献 */
        });
      }
    });
    /* ① 归一 */
    const n1 = {};
    usable.forEach(function (w) {
      const a = acc[w]; let n = 0;
      for (let d = 0; d < D; d++) n += a[d] * a[d];
      n = Math.sqrt(n) || 1;
      n1[w] = new Float64Array(D);
      for (let d = 0; d < D; d++) n1[w][d] = a[d] / n;
    });
    /* ② 共现图平滑：把 PMI 关联表 + 人工中英/同义桥的邻居混进来。
       RI 随机投影本身有噪声，这一步让「确实共现过 / 已确认同义」的词对明确靠近，
       也顺带把 gpu↔显卡、model↔模型 这类中英概念拉到同一片向量空间。 */
    const bridge = {};
    Object.keys(BRIDGE).forEach(function (k) {
      BRIDGE[k].forEach(function (t) {
        (bridge[k] = bridge[k] || []).push([t, 0.9]);
        (bridge[t] = bridge[t] || []).push([k, 0.9]);
      });
    });
    const smooth = {};
    usable.forEach(function (w) {
      const v = new Float64Array(D);
      for (let d = 0; d < D; d++) v[d] = n1[w][d];
      let sw = 0;
      ((rel && rel[w]) || []).slice(0, 6).concat((bridge[w] || []).slice(0, 4))
        .forEach(function (p) {
          const u = n1[p[0]];
          if (!u) return;
          const g = 0.5 * (p[1] || 0.5);
          for (let d = 0; d < D; d++) v[d] += u[d] * g;
          sw += g;
        });
      if (sw > 0) for (let d = 0; d < D; d++) v[d] /= (1 + sw);
      smooth[w] = v;
    });
    /* ③ 中心化：减掉所有词共享的公共方向（相当于去掉"全站通用词"这一维），
       余弦区分度会明显变好，否则任意两个词都因为共同语境而虚高。 */
    const mean = new Float64Array(D);
    usable.forEach(function (w) { const v = smooth[w]; for (let d = 0; d < D; d++) mean[d] += v[d]; });
    for (let d = 0; d < D; d++) mean[d] /= Math.max(1, usable.length);
    /* ④ 再归一 → int8 量化 */
    const out = new Uint8Array(usable.length * D);
    let kept = 0;
    const keepWords = [];
    usable.forEach(function (w) {
      const v = smooth[w];
      let n = 0;
      for (let d = 0; d < D; d++) { const x = v[d] - mean[d]; n += x * x; }
      n = Math.sqrt(n);
      if (!(n > 1e-9)) return;
      const row = kept * D;
      for (let d = 0; d < D; d++) {
        const q = Math.max(-127, Math.min(127, Math.round((v[d] - mean[d]) / n * 127)));
        out[row + d] = q < 0 ? q + 256 : q;      /* 存成无符号字节 */
      }
      keepWords.push(w);
      kept++;
    });
    return { d: D, words: keepWords, b: b64encode(out.subarray(0, kept * D)) };
  }

  /* 解码后的向量矩阵（懒加载，只读） */
  function vecMatrix() {
    if (vecCache) return vecCache;
    if (!M || !M.vec || !M.vec.words || !M.vec.b) return null;
    const u8 = b64decode(M.vec.b);
    const f = new Float32Array(u8.length);
    for (let i = 0; i < u8.length; i++) f[i] = (u8[i] << 24 >> 24) / 127;
    const pos = {};
    M.vec.words.forEach(function (w, i) { pos[w] = i; });
    vecCache = { d: M.vec.d, words: M.vec.words, pos: pos, a: f };
    return vecCache;
  }
  function wordVec(w) {
    const V = vecMatrix();
    if (!V || V.pos[w] === undefined) return null;
    return V.a.subarray(V.pos[w] * V.d, (V.pos[w] + 1) * V.d);
  }
  function wordSim(a, b) {
    const x = wordVec(a), y = wordVec(b);
    if (!x || !y) return 0;
    let dot = 0;
    for (let i = 0; i < x.length; i++) dot += x[i] * y[i];
    return dot;                     /* 已归一化，点积即余弦 */
  }
  /* 向量近义词：比共现表更"软"，能找到没在同一句出现过、但总在同类上下文里的词 */
  function nearWords(w, k, minSim) {
    const V = vecMatrix(), x = wordVec(w);
    if (!V || !x) return [];
    const out = [];
    for (let i = 0; i < V.words.length; i++) {
      const t = V.words[i];
      if (t === w) continue;
      let dot = 0;
      const base = i * V.d;
      for (let d = 0; d < V.d; d++) dot += x[d] * V.a[base + d];
      if (dot >= (minSim || 0.34)) out.push([t, dot]);
    }
    out.sort(function (p, q) { return q[1] - p[1]; });
    return out.slice(0, k || 6);
  }
  /* 句向量 = 句内词向量按 tf-idf 加权求和再 L2 归一。
     导出它是为了让 ai.js 能把全站句子向量缓存起来，查询时只做一次点积。 */
  function sentVec(t) {
    const V = vecMatrix();
    if (!V || !M) return null;
    const v = new Float64Array(V.d), tf = {};
    cut(t).forEach(function (w) { tf[w] = (tf[w] || 0) + 1; });
    let used = 0;
    Object.keys(tf).forEach(function (w) {
      const x = wordVec(w);
      if (!x) return;
      const g = (1 + Math.log(tf[w])) * Math.min(2.5, M.idf[w] || 0.5);
      for (let d = 0; d < V.d; d++) v[d] += x[d] * g;
      used++;
    });
    if (!used) return null;
    let n = 0;
    for (let d = 0; d < V.d; d++) n += v[d] * v[d];
    n = Math.sqrt(n);
    if (!(n > 1e-9)) return null;
    const out = new Float32Array(V.d);
    for (let d = 0; d < V.d; d++) out[d] = v[d] / n;
    return out;
  }
  /* 两段文本的向量余弦：问句与原句「意思接近但用词不同」时的兜底分 */
  function textSim(q, s) {
    const a = sentVec(q), b = sentVec(s);
    if (!a || !b) return 0;
    let dot = 0;
    for (let d = 0; d < a.length; d++) dot += a[d] * b[d];
    return Math.max(0, dot);
  }
  /* 给一组候选句按「与问句的向量相似度」重排用的分数表（不改动候选本身） */
  function rescore(q, list, getText) {
    if (!vecMatrix() || !list || !list.length) return null;
    return list.map(function (x) { return textSim(q, getText(x)); });
  }

  /* ---------------- 训练主入口 ---------------- */
  function build(text, pages, opts) {
    const o = opts || {};
    const t0 = Date.now();
    /* chars 记**原始语料长度**（与 data/lm.json 的口径一致，--check 才不会误报"语料变了"）；
       内部统计用清洗后的文本，两者可能差几个标点/标记字符，属正常。 */
    const rawLen = String(text || '').length;
    text = clean(text || '');
    if (text.length < 500) throw new Error('语料太小（' + text.length + ' 字）');
    const found = discover(text);
    const extra = structWords(pages);
    /* ★ 内置词组表只收「语料里真出现过」的：补的正是 PMI 挖不出的普通词
       （凝固度不高但确实是词，如「方法」「成本」「聪明」），不凭空造词。 */
    const lexHit = LEX_CN.filter(function (w) { return text.indexOf(w) >= 0; });
    const wordSet = {};
    found.forEach(function (x) { wordSet[x.w] = 1; });
    extra.forEach(function (w) { wordSet[w] = 1; });
    lexHit.forEach(function (w) { wordSet[w] = 1; });
    /* 硬桥的目标词若在语料里出现过，也确保进词典，否则「桥过去」也检索不到 */
    Object.keys(BRIDGE).forEach(function (k) {
      BRIDGE[k].forEach(function (w) {
        if (isCn(w.charAt(0)) && text.indexOf(w) >= 0) wordSet[w] = 1;
      });
    });
    const enHit = enWords(text, 3);
    enHit.forEach(function (w) { wordSet[w] = 1; });
    let words = Object.keys(wordSet);
    /* 体积护栏：词太多就按 discover 的得分砍掉尾部（结构化词 + 内置词组 + 英文术语永远保留） */
    const always = extra.concat(lexHit, enHit);
    if (words.length > (o.maxWords || 9000)) {
      const score = {};
      found.forEach(function (x) { score[x.w] = x.s; });
      words.sort(function (a, b) { return (score[b] || 0) - (score[a] || 0); });
      words = words.slice(0, o.maxWords || 9000);
      always.forEach(function (w) { if (words.indexOf(w) < 0) words.push(w); });
    }
    /* 装词典：buildRel / topics / buildVec 都要用 cut()。训完**保持就绪** ——
       CLI 与网页按钮调完 build 就能直接展示/使用语义层，不必再记着手动 fromJSON。 */
    cutMap = buildCutMap(words);
    enAlias = buildEnAlias(words);
    vecCache = null;
    const docTerms = {}, df = {};
    (pages || []).forEach(function (p) {
      const t = {};
      const chunks = [clean((p && p.label) || '')];
      ((p && p.blocks) || []).forEach(function (b) {
        if (!b) return;
        chunks.push(clean(b.title || ''), clean(b.text || ''));
        if (b.type === 'table') {
          (b.rows || []).forEach(function (r) { chunks.push(clean((r || []).join(' '))); });
        }
        if (Array.isArray(b.items)) {
          b.items.forEach(function (it) {
            chunks.push(clean(typeof it === 'string' ? it : (it && (it.name || it.label || it.text)) || ''));
          });
        }
      });
      cut(chunks.join(' ')).forEach(function (w) { t[w] = (t[w] || 0) + 1; });
      docTerms[p.id] = t;
      Object.keys(t).forEach(function (w) { df[w] = (df[w] || 0) + 1; });
    });
    const nDoc = Math.max(1, (pages || []).length);
    const idf = {};
    Object.keys(df).forEach(function (w) { idf[w] = Math.log(1 + nDoc / (1 + df[w])) + 0.1; });
    const topics = {};
    Object.keys(docTerms).forEach(function (id) {
      const t = docTerms[id];
      topics[id] = Object.keys(t).map(function (w) {
        return [w, Math.round((1 + Math.log(t[w])) * (idf[w] || 0.1) * 100) / 100];
      }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 24);
    });
    const sents = sentSplit(text);
    M = {
      v: 2, chars: rawLen, words: words, rel: {}, topics: topics,
      df: df, idf: idf, nDoc: nDoc, vec: null, has: null
    };
    M.has = {};
    words.forEach(function (w) { M.has[w] = 1; });
    /* 先算共现表：向量训练要用它做图平滑，让确实共现过的词对靠得更近 */
    M.rel = buildRel(sents, words, df);
    const vec = buildVec(sents, words, idf, df, o.vecDim || 128, M.rel);
    M.vec = vec;
    let payload = {
      v: 2, chars: rawLen, words: words, rel: M.rel,
      topics: topics, df: df, idf: idf, nDoc: nDoc, vec: vec
    };
    let bytes = utf8Bytes(JSON.stringify(payload));
    /* 超体积 → 先砍关联表（保留关联最强的），再砍主题词 */
    if (bytes > (o.maxBytes || MAX_BYTES)) {
      const rel2 = {};
      Object.keys(M.rel).forEach(function (w) { rel2[w] = M.rel[w].slice(0, 4); });
      payload.rel = rel2; M.rel = rel2;
      bytes = utf8Bytes(JSON.stringify(payload));
    }
    /* 仍超 → 把词向量降到 32 维（语义方向基本保留，体积减半） */
    if (bytes > (o.maxBytes || MAX_BYTES) && payload.vec) {
      const v2 = buildVec(sents, words, idf, df, 32, M.rel);
      payload.vec = v2; M.vec = v2; vecCache = null;
      bytes = utf8Bytes(JSON.stringify(payload));
    }
    const res = {
      payload: payload, bytes: bytes, chars: rawLen,
      words: words.length, relWords: Object.keys(payload.rel).length,
      topics: Object.keys(topics).length,
      vecWords: payload.vec ? payload.vec.words.length : 0,
      vecDim: payload.vec ? payload.vec.d : 0,
      lexWords: lexHit.length, enWords: enHit.length, ms: Date.now() - t0
    };
    return res;
  }

  /* ---------------- 运行时 ---------------- */
  function fromJSON(j) {
    if (!j || !j.words || !j.topics) return null;
    /* v1 产物没有 vec / enAlias，照样能跑 —— 只是不启用向量能力，其余完全降级兼容 */
    M = {
      v: j.v || 1, chars: j.chars || 0, words: j.words, rel: j.rel || {},
      topics: j.topics || {}, df: j.df || {}, idf: j.idf || {}, nDoc: j.nDoc || 0,
      vec: j.vec || null, has: null
    };
    M.has = {};
    M.words.forEach(function (w) { M.has[w] = 1; });
    cutMap = buildCutMap(M.words);
    enAlias = buildEnAlias(M.words);
    vecCache = null;
    return M;
  }
  function ready() { return !!M; }
  function info() { return M ? { words: M.words.length, rel: Object.keys(M.rel).length, pages: Object.keys(M.topics).length, chars: M.chars } : null; }
  function load(url) {
    if (M) return Promise.resolve(true);
    if (typeof fetch !== 'function') return Promise.resolve(false);
    return fetch(url, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return !!fromJSON(j); })
      .catch(function () { return false; });
  }

  /* 关键词：完整词 + tf-idf，滤掉碎片与虚词；返回词数组 */
  function keywords(pageText, k) {
    if (!M) return [];
    const tf = {};
    cut(pageText).forEach(function (w) { tf[w] = (tf[w] || 0) + 1; });
    const scored = Object.keys(tf).map(function (w) {
      /* 长词（「大语言模型」「反馈与建议」）信息量更高，优先出；两字通用词压一压 */
      return { w: w, s: (1 + Math.log(tf[w])) * (M.idf[w] || 0.1) * (w.length >= 3 ? 1.45 : 0.85) };
    }).filter(function (x) {
      return x.w.length >= 2 && !BAD_WORD[x.w] && !WEAK_WORD[x.w] && !TAIL_BAD.test(x.w);
    })
      .sort(function (a, b) { return b.s - a.s; });
    const out = [];
    scored.forEach(function (x) {
      if (out.length >= (k || 8)) return;
      /* 有包含关系时只留更长的那个（「语言模型」vs「大语言模型」→ 留后者） */
      if (out.some(function (o) { return o.length > x.w.length && o.indexOf(x.w) >= 0; })) return;
      if (out.some(function (o) { return x.w.length > o.length && x.w.indexOf(o) >= 0; })) {
        const i = out.findIndex(function (o) { return x.w.length > o.length && x.w.indexOf(o) >= 0; });
        out.splice(i, 1);
      }
      out.push(x.w);
    });
    return out;
  }

  /* 概念扩展：原词权重 1；共现 ≤0.55；★ 向量近义 ≤0.5；★ 中英/口语硬桥 0.7。
     三条路互补：共现=同句搭配，向量=同类上下文，硬桥=语料里压根没共现过的同义说法。
     ★ 输出只保留站内真实存在的词 —— 扩展词要能被 ai.js 的索引切出来对齐原句。 */
  function expand(terms, k, rawQuery) {
    if (!M) return [];
    const acc = {};
    const put = function (w, v) {
      if (!w || !M.has[w]) return;
      if (!acc[w] || acc[w] < v) acc[w] = v;
    };
    (terms || []).forEach(function (t) { acc[t] = 1; });
    (terms || []).forEach(function (t) {
      (M.rel[t] || []).slice(0, 4).forEach(function (p) { put(p[0], 0.55 * p[1]); });
      /* 向量近义词门槛抬高，且挡掉「顺着这条线往下读」这类长串噪声词：
         它们做胶囊看着还行，拼进检索串会把不相关原句拉进来。 */
      nearWords(t, 4, 0.52).forEach(function (p) {
        const w = p[0];
        if (isCn(w.charAt(0)) && w.length > 6) return;
        put(w, 0.5 * Math.min(1, p[1] / 0.8));
      });
      (BRIDGE[t] || []).forEach(function (w) { put(w, 0.7); });
    });
    /* 整串硬桥：像「多少钱」「长什么样」这类口语串，cut() 会切碎，得按原文再兜一次 */
    const raw = clean(rawQuery || '').toLowerCase();
    if (raw) {
      Object.keys(BRIDGE).forEach(function (key) {
        if (raw.indexOf(key) < 0) return;
        BRIDGE[key].forEach(function (w) { put(w, 0.72); });
      });
    }
    return Object.keys(acc).map(function (w) { return [w, Math.round(acc[w] * 100) / 100]; })
      .sort(function (a, b) { return b[1] - a[1]; }).slice(0, k || 12);
  }
  /* 语义扩展词（拼进查询串用，ai.js 的 tokens() 会把它们切成 2-gram 与句子索引对齐） */
  function expandWords(q, k) {
    if (!M) return [];
    const base = cut(q);
    const ex = expand(base, (k || 8) + base.length + 8, q);
    const out = [];
    ex.forEach(function (p) {
      if (base.indexOf(p[0]) >= 0) return;
      if (out.indexOf(p[0]) >= 0) return;
      if (out.length >= (k || 8)) return;
      out.push(p[0]);
    });
    return out;
  }
  /* 页面主题余弦：相关条目用 */
  function topicVec(id) {
    if (!M) return null;
    return M.topics[id] || null;
  }
  function topicSim(idA, idB) {
    const a = topicVec(idA), b = topicVec(idB);
    if (!a || !b) return 0;
    const vb = {};
    b.forEach(function (p) { vb[p[0]] = p[1]; });
    let dot = 0, na = 0, nb = 0;
    a.forEach(function (p) { na += p[1] * p[1]; if (vb[p[0]]) dot += p[1] * vb[p[0]]; });
    b.forEach(function (p) { nb += p[1] * p[1]; });
    return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
  }

  return {
    build: build, fromJSON: fromJSON, load: load, ready: ready, info: info,
    cut: cut, keywords: keywords, expand: expand, expandWords: expandWords,
    topicSim: topicSim, topicVec: topicVec,
    /* ★ 修复166：词向量 / 英文归一（都是只读的"权重"，不生成任何文字） */
    wordSim: wordSim, nearWords: nearWords, sentVec: sentVec,
    textSim: textSim, rescore: rescore,
    enNorm: enNorm, enWords: enWords,
    clean: clean, utf8Bytes: utf8Bytes, MAX_BYTES: MAX_BYTES
  };
});
