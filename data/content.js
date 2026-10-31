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
      "syncTs": 1793449317650,
      "roster": {},
      "tokenVault": {
        "v": 1,
        "iters": 60000,
        "salt": "p4SaADqscA75V7X30ywa3w==",
        "iv": "1yX3Ue5fHpAjSxNB",
        "ct": "bpg1HKMX8o04obVen3ZDwIDfnOK+MbKb88JYtfxmzUgm65AhYKqNt33nxz8SA8Qrd4KTfztR8XyL8l5ea1gdiivULBlhvQcXAgdvBeVbXyuNaGDS5m5xoElwSa8zAhttj5cN2aPk/q9TSwI6/4uyaAPf2s/BWdUjIgyDR0dWW3WzEqpcwZz/j7ndAU/nA8BQwuekL0giz0FqVe10or0PMwRbKkCsBC0euFYhRo66og6WX9VVenRjm7M4olRQpJ97B2mxmpDmlj+x6D283pJeOpDbpwSX"
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
          "text": "主要问题与典型任务？？？",
          "_ts": 1793416049359
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
      "id": "cognition",
      "kind": "map",
      "icon": "🧠",
      "label": "认知地图",
      "title": "认知地图",
      "description": "面对这个领域的问题，我们怎样思考、分析、实践，并持续成长？",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "认知地图聚焦**思考方法、分析案例与成长习惯**：我们怎样理解一个问题，依据什么判断，遇到新证据后怎样调整。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "我们的分析方法"
        },
        {
          "type": "table",
          "title": "方法与实例",
          "headers": [
            "方法",
            "应用例子",
            "当前判断"
          ],
          "rows": [
            [
              "系统拆解",
              "一次回答错误，是模型、提示词还是知识缺失？",
              "先查输入与提示，再怀疑模型（推断）"
            ],
            [
              "对照比较",
              "两个模型的比较是否用了同一组题目？",
              "只有条件一致，比较才有意义"
            ],
            [
              "反例检查",
              "什么情况下\"模型很聪明\"不成立？",
              "长尾知识与实时信息上容易失败"
            ]
          ],
          "_ts": 1793449317649
        },
        {
          "type": "heading",
          "level": 2,
          "text": "一次真实的认识修正（示例）"
        },
        {
          "type": "callout",
          "tone": "green",
          "title": "认识更新",
          "text": "**我们原来以为：**模型越大回答一定越准。\n**带来变化的资料：**课堂演示中，小模型配合好的检索反而答对了。\n**现在如何理解：**回答质量 = 模型能力 × 上下文质量，二者缺一不可。\n**仍然不知道：**检索质量怎样量化评估——已列入待学习清单。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "成长习惯"
        },
        {
          "type": "paragraph",
          "text": "- 先问问题再选工具；区分**事实**与**推断**；\n- 从任务困难反查知识缺口，连接到领域地图的课程路径；\n- 做小规模尝试并保留输入输出；每周检查一次地图并留下记录。"
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
    }
  ],
  "jumps": []
};
/*CONTENT-END*/
