/* =========================================================
 * 三张活地图 · 内容数据文件
 * 本文件由网站后台（管理员 → 同步到 GitHub）自动更新。
 * 手动编辑也可以：改 CONTENT-START 与 CONTENT-END 两个标记之间的 JSON 即可。
 * ========================================================= */
/*CONTENT-START*/
window.SITE_CONTENT = {
  "site": {
    "title": "三张活地图",
    "subtitle": "人工智能前沿与创新 · 课程大作业",
    "topic": "示例主题：大语言模型（LLM）—— 上线前请改成你们小组的选题",
    "description": "围绕所选领域，建立「领域 · 生态 · 认知」三张相互关联、持续更新的活地图，作为伴随大学四年的思考外脑。",
    "homeFeatures": [
      {
        "icon": "🖐️",
        "title": "可探索",
        "desc": "点击内容，查看含义、作用与关系"
      },
      {
        "icon": "🔗",
        "title": "相关联",
        "desc": "概念、工具、课程与案例相互链接"
      },
      {
        "icon": "🔎",
        "title": "可追溯",
        "desc": "重要内容标注来源，区分事实与推断"
      },
      {
        "icon": "🌱",
        "title": "可更新",
        "desc": "每周检查，让地图随学习持续生长"
      }
    ]
  },
  "config": {
    "admin": {
      "hint": "密码已于 2026/10/29 20:05 由仓库管理员重置（忘记密码应急）",
      "auth": {
        "v": 2,
        "iters": 60000,
        "salt": "98163396dcdd9f82eddad2f084d3f506",
        "hash": "f691b3bc3a1a55fd4ca6ecd30e6c76e45c4e8187af2be90ac7c9935cba980c89"
      }
    },
    "footer": {
      "note": "本站由小组共同维护 · 内容持续更新中",
      "githubUrl": ""
    },
    "collab": {
      "syncTs": 1793532785101,
      "roster": {},
      "tokenVault": {
        "v": 1,
        "iters": 210000,
        "salt": "yqLWFqqzza7isqR0iJPY4w==",
        "iv": "Bye7WMujFJ7+nBME",
        "ct": "j6DakV99jlSmx8AAuO1x5T+hmfxQ+p+MiDdS6dF1CvZSM5PFvIx0a1z7/lg799rA4OHTbh4osY1O8/8ad2n5QJdWuk0NKuU2quA9vxiMWmgXYXA4jCYFIAee3WomtotfeSbAqYACSVpqDD0P/BwkNxJbMoqSwX6A2NwT3z7y2LRXzaeE9ttjUQrwNMNhrHfQxyWg0lQWHJRY4dfJqmKZqqahrxnV+7AyCYPMPi4QeuXy0qK69OJ2UXSKa/Tli9/G7ikG0uGd+tr4t9kkcXq1Zuns25K6saNidUZcTDhI3B4eBaLjywLaTFdGVg=="
      }
    },
    "fbCloud": {
      "kind": "supabase",
      "url": "https://yrclasqlcatczjlingii.supabase.co/rest/v1/",
      "key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyY2xhc3FsY2F0Y3pqbGluZ2lpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0Mjc5NzUsImV4cCI6MjEwOTAwMzk3NX0.WKHIYCA-JlOAdZSbDPbv5LpElMLhwDfF4jKBdKGpXsc",
      "table": "lm_feedback"
    }
  },
  "pages": [
    {
      "id": "home",
      "kind": "home",
      "label": "首页",
      "blocks": []
    },
    {
      "id": "domain",
      "kind": "map",
      "icon": "🗺️",
      "label": "领域地图",
      "title": "领域地图",
      "description": "这个领域有什么知识、方法和工具？它们怎样关联？以后在哪里学？（当前为示例内容，登录管理员后即可修改为你们的选题）",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "领域地图回答三个问题：**这个领域有什么知识、方法和工具？它们怎样关联？以后在哪里学？**本页是示例，进入管理模式后点任意内容即可修改。"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "研究边界",
          "text": "我们聚焦语言模型的基本原理与使用，暂不展开分布式训练与多模态。后续根据课程进度补充。",
          "style": {
            "hl": "#ffc9de"
          },
          "_ts": 1793357765762
        },
        {
          "type": "heading",
          "level": 2,
          "text": "主要问题与典型任务",
          "_ts": 1793455315676
        },
        {
          "type": "paragraph",
          "text": "语言模型试图解决的核心问题是：**让机器根据上下文预测和生成自然语言。**\n一个典型任务是\"问答\"：用户提问 → 模型理解问题 → 生成回答 → 评估回答质量。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "方法与技术路线（示例图表）"
        },
        {
          "type": "chart",
          "chartType": "bar",
          "title": "三条技术路线的课堂关注热度（示意数据）",
          "labels": [
            "提示工程",
            "检索增强 RAG",
            "模型微调"
          ],
          "data": [
            86,
            72,
            54
          ],
          "unit": "票"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "课程与学习路径"
        },
        {
          "type": "paragraph",
          "text": "**前置基础：**高等数学（概率与矩阵）→ **核心覆盖：**人工智能导论、机器学习 → **实践应用：**本课程大作业 → **自主拓展：**经典论文与开源项目。\n\n以上为示例，请对照你们专业的培养方案逐条核实，无法确认的先标\"待核实\"。"
        },
        {
          "type": "files",
          "title": "学习资料与附件",
          "items": [
            {
              "name": "课程大作业要求：三张活地图",
              "url": "https://ai-course-assignment.app.workbuddy.host/#assignment"
            },
            {
              "name": "MDN · Web 开发入门（做本站用的技术）",
              "url": "https://developer.mozilla.org/zh-CN/docs/Learn_web_development/Getting_started"
            }
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "items": [
            {
              "label": "Vaswani 等, Attention Is All You Need (2017)",
              "url": "https://arxiv.org/abs/1706.03762",
              "id": "r1"
            },
            {
              "label": "示例来源：请替换为你们实际查阅的资料",
              "url": "#",
              "id": "r2"
            }
          ],
          "seq": 2
        },
        {
          "type": "entries",
          "title": "下级条目",
          "mode": "card",
          "cols": 3,
          "note": ""
        },
        {
          "type": "heading",
          "level": 2,
          "text": "核心概念"
        },
        {
          "type": "table",
          "title": "核心概念速览（示例）",
          "headers": [
            "概念",
            "一句话解释",
            "相关工具 / 模型"
          ],
          "rows": [
            [
              "Token / 分词",
              "把文字切成模型能处理的最小单位",
              "tiktoken、SentencePiece"
            ],
            [
              "Transformer",
              "目前==主流的模型结构，核心是注意力机制==",
              "GPT 系列、LLaMA 系列"
            ],
            [
              "预训练",
              "先在海量文本上学习\"下一个词\"的规律",
              "各类基座模型"
            ],
            [
              "微调 / RAG",
              "用少量数据或外部知识让模型适配具体任务",
              "LoRA、向量数据库"
            ]
          ],
          "free": {
            "x": 1.7,
            "y": 1177,
            "w": 94.4,
            "ride": 0
          },
          "_ts": 1793415612554
        }
      ],
      "heroAlign": ""
    },
    {
      "id": "demo-rag",
      "kind": "page",
      "icon": "🧩",
      "label": "示例 · RAG",
      "title": "示例条目：检索增强生成（RAG）",
      "description": "一条「打样」示例：知识点 = 一句话 + 流程 + 图表 + 来源 + 待核实。把文字换成你们的选题即可直接用。",
      "parent": "domain",
      "heroAlign": "",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "这一页是**示例条目**（打样用）：演示「三张活地图」里一条知识该长什么样 —— 一句话说清 → 讲清流程 → 给出可查证的来源 → 列出还没弄清的地方。\n内容讲 RAG，事实都来自公开资料；你们把文字换成自己的选题即可，**块的类型可以直接照抄**。"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话解释",
          "text": "RAG（检索增强生成）= 先**检索**外部资料，把片段塞进提示词，再让模型**基于这些片段**生成回答。它把「模型记住了什么」换成「这次给了它什么」，于是答案可以指名道姓地溯源。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "它是怎么工作的"
        },
        {
          "type": "paragraph",
          "text": "典型流水线四步：① 把资料切成几百 token 的小块；② 用嵌入模型把每块变成向量，存进向量库；③ 用户提问时按相似度取回最相关的若干块（实践中常与 BM25 这类关键词检索并用）；④ 把这些块连同问题一起送给生成模型。\n**关键在最后一步：模型只负责「照着材料说」，不负责「记得」。**"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "关键概念（表格示例）"
        },
        {
          "type": "table",
          "title": "关键概念速览",
          "headers": [
            "概念",
            "做什么",
            "常见做法"
          ],
          "rows": [
            [
              "检索器 Retriever",
              "把问题变成查询，从库里取回相关片段",
              "稠密向量检索、BM25"
            ],
            [
              "生成器 Generator",
              "基于「问题 + 检索片段」写出回答",
              "对话模型 / seq2seq"
            ],
            [
              "参数记忆",
              "训进模型权重里的知识",
              "预训练得到，改起来很贵"
            ],
            [
              "非参数记忆",
              "存在模型之外的知识",
              "文档库 + 向量数据库，随时可改"
            ]
          ]
        },
        {
          "type": "heading",
          "level": 2,
          "text": "一个可查证的进展（2024）"
        },
        {
          "type": "paragraph",
          "text": "Anthropic 在 2024-09-19 公开的 **Contextual Retrieval**：老做法先切块再嵌入，块一旦被切开就丢了上下文（一句话忽然没了主语），检索就容易找错。他们的做法是先给每块**补一段上下文说明**再嵌入 / 建索引（Contextual Embeddings + Contextual BM25）。\n公布的数字：检索失败率降低 **49%**；再加一步重排（rerank）后降低 **67%**（他们测的 top-20 检索失败率 5.7% → 1.9%）。"
        },
        {
          "type": "chart",
          "chartType": "bar",
          "title": "检索失败率（Anthropic 2024 公布，越低越好）",
          "labels": [
            "仅向量检索（基线）",
            "上下文检索 + 重排"
          ],
          "data": [
            5.7,
            1.9
          ],
          "unit": "%"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "怎么用到我们的地图里"
        },
        {
          "type": "paragraph",
          "text": "建议每条知识固定四问：**是什么**（一句话）、**怎么做**（流程）、**凭什么**（来源 + 日期）、**还没弄清**（待核实清单）。\n本站里，第三问交给页面底部的「来源」块，第四问交给橙色提示块 —— 这一页就是按这个模板写的，结构可以直接复制到你们自己的条目里。"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "domain",
            "ecology"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "items": [
            {
              "label": "Lewis 等, Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks（NeurIPS 2020，arXiv:2005.11401）",
              "url": "https://arxiv.org/abs/2005.11401",
              "id": "r1"
            },
            {
              "label": "Anthropic, Introducing Contextual Retrieval（2024-09-19）",
              "url": "https://www.anthropic.com/news/contextual-retrieval",
              "id": "r2"
            }
          ]
        },
        {
          "type": "files",
          "title": "延伸阅读",
          "items": [
            {
              "name": "arXiv:2005.11401 原文（PDF）",
              "url": "https://arxiv.org/pdf/2005.11401"
            },
            {
              "name": "Anthropic · Contextual Retrieval 原文",
              "url": "https://www.anthropic.com/news/contextual-retrieval"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "待核实 / 还要讨论",
          "text": "- 「49% / 67%」是 Anthropic 在自己选的数据集与嵌入模型上测的，换语料不一定一样，我们自己的地图要复测。\n- 2024 年之后还有 GraphRAG 等多跳检索方案，本页尚未核对原始论文，先不下结论。\n- 切块长度这类工程参数没有统一答案，属于实践取舍。"
        },
        {
          "type": "hr"
        }
      ]
    },
    {
      "id": "ecology",
      "kind": "map",
      "icon": "🌐",
      "label": "生态地图",
      "title": "生态地图",
      "description": "谁在推动这个领域？技术、资源、商业和产业关系如何运转？",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "生态地图不是\"人物和机构名单\"，重点是讲清楚**具体关系**：谁依赖谁、谁资助谁、谁采用了谁的成果。"
        },
        {
          "type": "table",
          "title": "重要参与者（示例）",
          "headers": [
            "参与者",
            "类型",
            "主要贡献",
            "与领域地图的关联"
          ],
          "rows": [
            [
              "OpenAI",
              "企业",
              "GPT 系列模型、API 服务",
              "Transformer 结构的规模化应用"
            ],
            [
              "Meta",
              "企业",
              "LLaMA 开源模型",
              "让研究者能低成本获得基座模型"
            ],
            [
              "Hugging Face",
              "平台社区",
              "模型与数据集托管、Transformers 库",
              "几乎所有微调实践的入口"
            ],
            [
              "高校实验室",
              "学术",
              "算法创新、论文与评测",
              "提出新方法，企业再工程化"
            ]
          ],
          "_ts": 1793290941256
        },
        {
          "type": "chart",
          "chartType": "pie",
          "title": "某开源社区模型来源构成（示意数据）",
          "labels": [
            "社区微调",
            "企业开源",
            "高校发布"
          ],
          "data": [
            62,
            28,
            10
          ],
          "unit": "个"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "具体关系举例"
        },
        {
          "type": "paragraph",
          "text": "- **依赖：**多数微调实践 **依赖** Hugging Face 提供的模型权重与工具库；\n- **采用：**企业产品 **采用** 开源基座模型再自行训练；\n- **资助：**云厂商 **资助 / 提供算力** 给高校实验室；\n- **竞争：**闭源 API 服务与开源模型在成本和隐私上互相竞争。"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "推断标注",
          "text": "上述关系为课堂讨论后的**团队推断**，正式使用前请逐条补充公开来源核实；无法核实的保留\"推断\"标记。"
        },
        {
          "type": "sources",
          "title": "本页来源",
          "items": [
            {
              "label": "Hugging Face 官网",
              "url": "https://huggingface.co",
              "id": "r1"
            },
            {
              "label": "示例来源：请替换",
              "url": "#",
              "id": "r2"
            }
          ],
          "seq": 2
        }
      ],
      "heroAlign": ""
    },
    {
      "id": "updates",
      "kind": "page",
      "icon": "🧭",
      "label": "更新记录",
      "title": "更新记录",
      "description": "地图随着学习持续生长：这里记录每次重要修改的时间、依据和原因。",
      "blocks": [
        {
          "type": "paragraph",
          "text": "作业要求**每周至少检查一次地图**；没有值得纳入的新变化时，记录检查结果即可，不必为了更新而增加内容。"
        },
        {
          "type": "table",
          "title": "更新日志",
          "headers": [
            "日期",
            "更新对象",
            "依据",
            "修改内容与原因"
          ],
          "rows": [
            [
              "2026-10-26",
              "全部页面",
              "作业要求发布",
              "建立网站与三张地图的初始框架（示例行，请替换）"
            ],
            [
              "",
              "",
              "",
              ""
            ]
          ],
          "_ts": 1793376062281
        },
        {
          "type": "callout",
          "tone": "gray",
          "title": "待核实清单",
          "text": "- 培养方案中的课程关联（待对照最新培养方案）\n- 生态地图中的合作关系（待补充公开来源）"
        }
      ],
      "heroAlign": ""
    },
    {
      "id": "feedback",
      "kind": "page",
      "icon": "💬",
      "label": "反馈与建议",
      "title": "反馈与建议",
      "description": "对我们的工作有疑问、发现错误或有改进建议？在下方留言（可匿名）。留言与处理记录对所有人公开，我们会逐条回应。",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "如果你对我们的**选题、页面、资料或分工**有疑问、发现错误，或者有改进建议，欢迎在下方留言——**可以匿名**。留言和我们的处理记录（怎样核实 → 改了什么 → 为什么这样处理）**对所有人公开**，既方便互相参考，也便于课程检查。"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "我们会怎么处理（作业要求）",
          "text": "**每组应获得至少 3 名非本组同学的独立反馈**，且每条都要回应：记录「同学提出了什么 → 我们怎样核实 → 修改了什么 → 为什么调整或保留原判断」；**不采纳也会写明理由**。提问题时建议说清楚：针对哪个页面或哪项工作、遇到了什么问题、期望是什么。"
        }
      ],
      "heroAlign": "",
      "descStyle": {
        "hl": "#fff3b0"
      }
    },
    {
      "id": "discuss",
      "kind": "page",
      "icon": "🗣️",
      "label": "讨论区",
      "title": "讨论区",
      "description": "围绕三张地图自由讨论：提问、补充材料、互相质疑都可以。与「反馈与建议」分开，避免正式反馈被聊天淹没。",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "这里像一个小型讨论版：可以**提问、补充材料、质疑某条判断**，也可以只看别人在聊什么。发言请遵守基本礼貌；恶意刷屏会被屏蔽身份码。"
        },
        {
          "type": "callout",
          "tone": "green",
          "title": "讨论区与反馈页的分工",
          "text": "**本页**用于自由讨论（想法、补充材料、互相答疑）；**「反馈与建议」页**用于希望我们动手修改的正式意见——那边每条都会记录「怎样核实 → 改了什么 → 为什么这样处理」并对所有人公开。想让我们改内容的，建议写到反馈页。"
        }
      ],
      "heroAlign": ""
    },
    {
      "id": "about",
      "kind": "page",
      "icon": "👥",
      "label": "关于我们",
      "title": "关于我们",
      "description": "小组成员、分工与协作方式。",
      "blocks": [
        {
          "type": "paragraph",
          "text": "本网站由小组成员共同维护。作业要求：整体结构、主要关系和重要判断共同讨论；每位成员能解释自己参与的内容。"
        },
        {
          "type": "table",
          "title": "成员与分工",
          "headers": [
            "成员",
            "主要角色",
            "当前任务",
            "备注"
          ],
          "rows": [
            [
              "成员 A",
              "内容 + 网站开发",
              "搭建与部署本网站",
              "（示例行，请修改）"
            ],
            [
              "成员 B",
              "资料核查",
              "为领域地图补充来源",
              ""
            ],
            [
              "成员 C",
              "生态调研",
              "整理参与者关系",
              ""
            ]
          ]
        },
        {
          "type": "callout",
          "tone": "gray",
          "title": "协作规范",
          "text": "重要内容标明来源与时间；区分事实、他人观点与团队推断；AI 的回答不作为事实证据；不伪造来源、反馈或更新记录。"
        }
      ],
      "heroAlign": ""
    },
    {
      "id": "node-p1zy0",
      "kind": "page",
      "icon": "📄",
      "label": "测试",
      "title": "",
      "description": "哈哈哈哈哈哈哈",
      "heroAlign": "",
      "blocks": [
        {
          "type": "paragraph",
          "size": "normal",
          "text": "",
          "style": {}
        }
      ],
      "parent": "domain"
    }
  ],
  "discuss": [
    {
      "id": "D-01-6n13",
      "pid": "",
      "dev": "访客9052",
      "nick": "访客9052",
      "text": "这是什么鬼",
      "ts": 1793446498214,
      "del": 1793446587830
    },
    {
      "id": "D-02-no0y",
      "pid": "D-01-6n13",
      "dev": "访客9052",
      "nick": "访客9052",
      "text": "我也觉得就是个垃圾网站。",
      "ts": 1793446528103,
      "del": 1793446583744
    },
    {
      "id": "D-03-engd",
      "pid": "D-01-6n13",
      "dev": "访客9052",
      "nick": "访客9052",
      "text": "同感同感，太烂了。",
      "ts": 1793446543386,
      "del": 1793446579557
    },
    {
      "id": "D-04-nkjv",
      "pid": "",
      "dev": "访客9052",
      "nick": "访客9052",
      "text": "垃圾网站垃圾网站，赶快把它删了。",
      "ts": 1793446761520,
      "del": 1793534040566
    },
    {
      "id": "D-05-tbsu",
      "pid": "D-04-nkjv",
      "dev": "访客6852",
      "nick": "访客6852",
      "text": "怎么能这么讲",
      "ts": 1793533974285,
      "del": 1793534040566
    },
    {
      "id": "D-06-kgae",
      "pid": "D-04-nkjv",
      "dev": "访客4040",
      "nick": "访客4040",
      "text": "是的啊",
      "ts": 1793533993248,
      "del": 1793534036981
    }
  ],
  "jumps": []
};
/*CONTENT-END*/
