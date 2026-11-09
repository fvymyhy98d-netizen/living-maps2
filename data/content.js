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
    "topic": "大语言模型的构建",
    "description": "我们围绕大语言模型构建的全过程，建立在领域 · 生态 · 认知方面三张相互关联、持续更新的活地图",
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
    ],
    "subStyle": {},
    "homeSection1": "三张地图，一个外脑。",
    "heroStyle": {},
    "topicStyle": {},
    "descStyle": {}
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
      "syncTs": 1794222527705,
      "roster": {},
      "tokenVault": {
        "v": 1,
        "iters": 210000,
        "salt": "9F+n/jiHHSSdTkKHJh8oWg==",
        "iv": "FnJ8D/wYQ5aPej5f",
        "ct": "inPmrNGwUtl+37kwU9zDzf4KV2pKOTBXFEIuYxOzz9CkixbMCVH6iG0EJgphshoO0OxZZGRmUlBs1SMA7zS0XZ0gkYae5NLolYajTfVaciiYnVdtN3prG62AXDfFDYwijDmPhShZF53pkifzLIKqfBl6BfAXJpFJupNrFy4i5WEe8SLIb1kE0xpNzLWgRbgwA9mprWZKvSTiXT3qxM1PpdzMlmY9KgyUipNyM9BZ9LA+nAu+WqYpTQyIMPKF/9eiWpu3V6afSjBr5GOZ54YNZ6a88oy1UkWzKKL4z5ANp0R4PG9b7R2E0cmaka4="
      },
      "tomb": {
        "demo-rag": 1794212567953
      }
    },
    "fbCloud": {
      "kind": "supabase",
      "url": "https://yrclasqlcatczjlingii.supabase.co/rest/v1/",
      "key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyY2xhc3FsY2F0Y3pqbGluZ2lpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0Mjc5NzUsImV4cCI6MjEwOTAwMzk3NX0.WKHIYCA-JlOAdZSbDPbv5LpElMLhwDfF4jKBdKGpXsc",
      "table": "lm_feedback"
    },
    "ui": {
      "hideAsk": false
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
      "title": "领域地图：造一个语言模型要经过哪些环节",
      "description": "从一张显卡到别人能用上，十二个环节排成一条线。点任意关键词进入条目页。",
      "heroAlign": "",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "这张图回答一个问题：**如果要把一个大语言模型从零做出来，中间到底经过哪些环节？**\n十二个关键词分成四段，点任意一个进入条目页——那里有一句话解释、具体做法、真实数字和来源。"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话",
          "text": "这十二个环节不是十二个可选步骤，**是一条因果链**：每一个都在补上一个留下的缺陷。所以顺序换不了，也很难跳。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "关键词（点进去展开）"
        },
        {
          "type": "paragraph",
          "text": "**① 进模型之前：把文字变成数字。** 这四步是单向流水，顺序不能换。先按显卡定规模——不知道规模，就不知道该收多少数据；收了数据才谈清洗——脏东西不清掉，分词会把它永久固定进词表；分词放最后，因为词表大小要跟语料和规模匹配。做完这一段，你手上只有数字，还没有模型。"
        },
        {
          "type": "table",
          "title": "四个阶段，上一段的产出就是下一段的原料",
          "headers": [
            "阶段",
            "顺序",
            "做完手上有什么"
          ],
          "rows": [
            [
              "① 进模型之前",
              "定规模 → 数据 → 清洗 → 分词",
              "一堆整数编号（token），模型唯一能读的东西"
            ],
            [
              "② 模型与目标",
              "结构 → 损失",
              "一个形状定好、优化方向也定好的模型"
            ],
            [
              "③ 让它学",
              "训练 → 预训练",
              "base model：会续写，但不会回答问题"
            ],
            [
              "④ 变成产品",
              "SFT → 对齐 → 评测 → 部署",
              "能回答、答得合口味、被证明过、别人能访问的模型"
            ]
          ]
        },
        {
          "type": "entries",
          "title": "① 进模型之前",
          "mode": "card",
          "cols": 2,
          "note": "",
          "only": [
            "n-scale",
            "n-data",
            "n-clean",
            "n-token"
          ]
        },
        {
          "type": "paragraph",
          "text": "**② 模型与目标：定形状，也定方向。** 这两个必须一起定。结构决定这套参数能表达多复杂的关系，损失函数决定它往哪个方向优化。只换结构不改损失，等于换了车却不换导航——跑得越快偏得越远。"
        },
        {
          "type": "entries",
          "title": "② 模型长什么样",
          "mode": "card",
          "cols": 2,
          "note": "",
          "only": [
            "n-arch",
            "n-loss"
          ]
        },
        {
          "type": "paragraph",
          "text": "**③ 怎么让它学：一个讲手段，一个讲阶段。** 训练是手段——优化器怎么选、学习率怎么调、梯度炸了怎么救；预训练是阶段——拿几千亿字的文本，让它把语言规律吃进去。先有手段，才谈得上阶段。"
        },
        {
          "type": "entries",
          "title": "③ 它是怎么学会的",
          "mode": "card",
          "cols": 2,
          "note": "",
          "only": [
            "n-train",
            "n-pretrain"
          ]
        },
        {
          "type": "paragraph",
          "text": "**④ 怎么才算好用：把一个\"只会续写\"的东西变成\"能交付\"的东西。** 这四步加工的是同一个 base model——它只会接着你的话往下写，不会回答问题。SFT 教它按问答格式说话，对齐调整它的偏好，评测证明它真行，部署让别人能打开。跳步的代价很直接：没评测就部署，等于闭着眼上线。"
        },
        {
          "type": "entries",
          "title": "④ 怎么才算好用",
          "mode": "card",
          "cols": 2,
          "note": "",
          "only": [
            "n-sft",
            "n-align",
            "n-eval",
            "n-deploy"
          ]
        },
        {
          "type": "heading",
          "level": 2,
          "text": "这十二步是怎么咬合的"
        },
        {
          "type": "paragraph",
          "text": "从终点往回看最清楚。你要的是「别人打开网页能用」，那就得先让它**答得对**——这是[评测](#/p/n-eval)要证明的事；要答得对，得先让它**愿意回答问题**，这是[对齐](#/p/n-align)和[监督微调](#/p/n-sft)干的事；而它之所以能被教会回答，是因为前面已经被喂成了一个**会续写的底座**，这就是[预训练](#/p/n-pretrain)。再往前，预训练需要能被稳定跑起来（[训练循环](#/p/n-train)）、需要正确的打分方式（[损失](#/p/n-loss)）、需要一台能处理语言的机器（[结构](#/p/n-arch)）、需要把文字切成它认识的单位（[分词](#/p/n-token)）、需要干净且够多的原料（[数据](#/p/n-data)、[清洗](#/p/n-clean)），最后落在最现实的一步：你的卡装不装得下（[定规模](#/p/n-scale)）。\n**每一环都在替下一环解决一个具体麻烦，而不是\"顺便多做一步\"。**"
        },
        {
          "type": "table",
          "title": "一眼速查：每个环节出问题时，你会看到什么",
          "headers": [
            "环节",
            "这一环在干什么",
            "出问题时的典型症状"
          ],
          "rows": [
            [
              "定规模",
              "用硬件预算反推模型大小",
              "训到一半显存爆了，或者根本跑不完"
            ],
            [
              "数据",
              "决定模型见过什么样的世界",
              "生成内容偏科、口音奇怪、全是广告"
            ],
            [
              "清洗",
              "把重复、噪声、脏话剔掉",
              "模型开始背原文、复读、说胡话"
            ],
            [
              "分词",
              "把文字变成整数序列",
              "中文特别费 token，一句话要切开几十个碎片"
            ],
            [
              "结构",
              "决定信息怎么在序列里流动",
              "长句后半段接不上前半段，指代全乱"
            ],
            [
              "损失",
              "定义什么叫\"预测对了\"",
              "训练不收敛，或者收敛了但模型只会复读"
            ],
            [
              "训练",
              "让参数真的动起来",
              "loss 卡住不动、突然飙升、梯度爆炸"
            ],
            [
              "预训练",
              "在大量文本上学语言规律",
              "能生成通顺句子，但完全不听指令"
            ],
            [
              "监督微调",
              "教它\"回答问题\"这个格式",
              "回答格式对了，内容还是错的；或学了新的忘了旧的"
            ],
            [
              "对齐",
              "让答案符合人的偏好",
              "答案变长了、变客气了，但信息量没变"
            ],
            [
              "评测",
              "证明它真的行",
              "分数很高，一换题就崩；或者分数根本不可复现"
            ],
            [
              "推理部署",
              "让真实用户用得上",
              "第一个问题等四十秒，第二个人来了直接卡死"
            ]
          ]
        },
        {
          "type": "files",
          "title": "顺着这条线往下读",
          "items": [
            {
              "name": "Datawhale · Happy-LLM（中文，八章几乎对应这十二步）",
              "url": "https://github.com/datawhalechina/happy-llm"
            },
            {
              "name": "《大语言模型》赵鑫等（人大，免费在线，理论最成体系）",
              "url": "https://llmbook-zh.github.io/"
            },
            {
              "name": "Karpathy · nanoGPT（几百行跑通 GPT）",
              "url": "https://github.com/karpathy/nanoGPT"
            },
            {
              "name": "Stanford CS336（从零构建语言模型，课程材料全公开）",
              "url": "https://stanford-cs336.github.io/spring2025/"
            }
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 3,
          "items": [
            {
              "label": "Karpathy, nanoGPT（GPT 的最小可运行实现）",
              "url": "https://github.com/karpathy/nanoGPT",
              "id": "r1"
            },
            {
              "label": "赵鑫等,《大语言模型》（中国人民大学出版社，在线版）",
              "url": "https://llmbook-zh.github.io/",
              "id": "r2"
            },
            {
              "label": "Hugging Face, LLM Course（含中文版）",
              "url": "https://huggingface.co/learn/llm-course",
              "id": "r3"
            }
          ]
        }
      ]
    },
    {
      "id": "ecology",
      "kind": "map",
      "icon": "🌐",
      "label": "生态地图",
      "title": "生态地图：谁在做这件事，用什么做",
      "description": "论文、开源模型、训练框架、推理服务、评测体系、社区。一个环节对应一群人。",
      "heroAlign": "",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "**生态地图不是\"人物和机构名单\"，重点是讲清具体关系**：谁依赖谁、谁资助谁、谁采用了谁的成果。\n领域地图讲的是\"要做什么\"，这张图讲的是**\"谁在做、用什么做、去哪找\"**。同一个环节往往对应一个开源项目、一篇论文、一家机构——把这些对上号，查资料的速度完全不一样。"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话",
          "text": "这个生态有个特点：**几乎每一个环节都有成熟的开源工具**。所以\"我要造模型\"这件事，八成不是从零写代码，而是选用哪些零件、怎么拼。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "关键词（点进去展开）"
        },
        {
          "type": "paragraph",
          "text": "**① 先学会：不懂的时候，看别人怎么讲。** 课程和社区的分工不一样——课程保证你不漏掉关键步骤，社区保证你卡住时能问到具体的人。先用课程建立顺序感，再去社区解决具体报错。"
        },
        {
          "type": "table",
          "title": "按\"你在哪一步卡住了\"查，不按名气查",
          "headers": [
            "什么时候看这一组",
            "看哪几个",
            "能解决什么"
          ],
          "rows": [
            [
              "完全不懂，不知道从哪下手",
              "教程 + 社区",
              "拿到一条有顺序的学习路径"
            ],
            [
              "要原料：模型、语料、词表",
              "开源模型 + 数据工具 + 分词器",
              "省掉从零造这三样的时间"
            ],
            [
              "要真的开始训练和微调",
              "训练框架 + 后训练工具",
              "多卡怎么切、显存怎么省、怎么调成会回答"
            ],
            [
              "要上线、要说服别人它行",
              "推理服务 + 评测 + 论文",
              "跑得快、扛得住、拿得出证据"
            ]
          ]
        },
        {
          "type": "entries",
          "title": "① 先学会（教程与课程）",
          "mode": "card",
          "cols": 2,
          "note": "",
          "only": [
            "e-open-course",
            "e-community"
          ]
        },
        {
          "type": "paragraph",
          "text": "**② 原料从哪来：这三样都能直接用现成的。** 开源模型省掉结构设计，公开数据集省掉收集，分词器几十分钟就能自己训一个。这一组的意义是：**你不需要从零开始**，但要知道每一件替代品替你省掉了什么、又牺牲了什么。"
        },
        {
          "type": "entries",
          "title": "② 模型与数据从哪来",
          "mode": "card",
          "cols": 2,
          "note": "",
          "only": [
            "e-models",
            "e-data-tools",
            "e-tokenizer"
          ]
        },
        {
          "type": "paragraph",
          "text": "**③ 怎么训、怎么调：一个管\"跑得动\"，一个管\"调得对\"。** 训练框架解决工程问题——多张卡怎么切、显存怎么省、断了怎么续；后训练工具解决效果问题——怎么把 base model 变成会按指令回答的模型。"
        },
        {
          "type": "entries",
          "title": "③ 怎么训、怎么调",
          "mode": "card",
          "cols": 2,
          "note": "",
          "only": [
            "e-train-fw",
            "e-posttrain"
          ]
        },
        {
          "type": "paragraph",
          "text": "**④ 怎么服务、怎么证明：上线与验收。** 推理服务让它跑得快、扛得住并发；评测体系证明它不是只会说漂亮话。**论文严格说不属于\"上线\"这一组**——把它放在这里，是因为你查任何一个工具为什么这么设计，最后都会回到原论文。想找依据就直接跳过去，不用按顺序读。"
        },
        {
          "type": "entries",
          "title": "④ 怎么服务、怎么证明",
          "mode": "card",
          "cols": 2,
          "note": "",
          "only": [
            "e-infer",
            "e-eval",
            "e-papers"
          ]
        },
        {
          "type": "heading",
          "level": 2,
          "text": "这张图怎么用"
        },
        {
          "type": "paragraph",
          "text": "假设你现在卡在[训练不收敛](#/p/n-train)。在这张图里对应三件事：去[教程](#/p/e-open-course)里找别人的训练脚本对照超参；去[训练框架](#/p/e-train-fw)的 issue 区搜 `loss nan`；去[论文](#/p/e-papers)里找同规模模型的配置表。\n**每个环节都同时有\"学\"和\"用\"两条入口**——教程负责让你看懂，工具负责让你跑通，论文负责让你知道边界在哪。"
        },
        {
          "type": "table",
          "title": "一张对照表：环节 → 生态位 → 代表项目",
          "headers": [
            "环节",
            "对应生态位",
            "代表项目 / 机构"
          ],
          "rows": [
            [
              "分词",
              "分词器实现",
              "tiktoken（OpenAI）、SentencePiece（Google）、HF Tokenizers"
            ],
            [
              "结构",
              "模型实现",
              "nanoGPT、HF Transformers、LLaMA / Qwen 官方仓库"
            ],
            [
              "训练",
              "分布式训练框架",
              "Megatron-LM（NVIDIA）、DeepSpeed（微软）、ColossalAI"
            ],
            [
              "数据",
              "数据处理流水线",
              "Data-Juicer（阿里）、text-dedup、HF Datasets"
            ],
            [
              "微调",
              "后训练工具链",
              "LLaMA-Factory、ms-swift（阿里）、TRL（Hugging Face）"
            ],
            [
              "推理",
              "推理服务引擎",
              "vLLM、SGLang、llama.cpp、Ollama"
            ],
            [
              "评测",
              "评测框架与榜单",
              "OpenCompass、lm-evaluation-harness、C-Eval"
            ],
            [
              "学习",
              "系统教程",
              "Datawhale 系列、Karpathy 课程、CS336、d2l"
            ]
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 3,
          "items": [
            {
              "label": "Hugging Face, LLM Course",
              "url": "https://huggingface.co/learn/llm-course",
              "id": "r1"
            },
            {
              "label": "Datawhale, Happy-LLM（中文系统教程）",
              "url": "https://github.com/datawhalechina/happy-llm",
              "id": "r2"
            },
            {
              "label": "Stanford CS336: Language Modeling from Scratch",
              "url": "https://stanford-cs336.github.io/spring2025/",
              "id": "r3"
            }
          ]
        },
        {
          "type": "files",
          "title": "直接开始",
          "items": [
            {
              "name": "Hugging Face（模型、数据集、课程的总入口）",
              "url": "https://huggingface.co/"
            },
            {
              "name": "ModelScope 魔搭（国内可直连，中文模型多）",
              "url": "https://modelscope.cn/"
            },
            {
              "name": "Papers with Code（论文 + 代码 + 榜单）",
              "url": "https://paperswithcode.com/"
            }
          ]
        }
      ]
    },
    {
      "id": "cognition",
      "kind": "map",
      "icon": "🧭",
      "label": "认知地图",
      "title": "认知地图：我们怎么想，哪里想错了",
      "description": "不是知识清单，是判断力的来源：因果链、认知修正、权衡、排障方法、能力边界。",
      "heroAlign": "",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "前两张图讲\"世界是什么样\"，这张图讲**\"我们怎么理解它、哪里理解错了、还差多远\"**。\n它是三张图里唯一会随着学习不断被推翻重写的一张。"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话",
          "text": "这张图记录的不是结论，是**判断的依据**：为什么相信这个、什么时候改的、改成了什么、还有哪里不敢下结论。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "关键词（点进去展开）"
        },
        {
          "type": "paragraph",
          "text": "**① 怎么理解：三个角度，不是三个步骤。** 因果解释\"为什么顺序换不了\"，权衡解释\"为什么没有最优解只有取舍\"，方法解释\"卡住时按什么顺序排查\"。三个都读完，你才算能独立判断一个新的环节该插在哪里。"
        },
        {
          "type": "table",
          "title": "三层，不是三步",
          "headers": [
            "层",
            "回答的问题",
            "什么时候用"
          ],
          "rows": [
            [
              "① 怎么理解",
              "这条链路为什么是这个顺序？哪里必须取舍？卡住时按什么顺序查？",
              "刚学完、要给别人讲清楚的时候"
            ],
            [
              "② 哪里想错了",
              "我们原来以为 X，后来发现是 Y，凭什么是 Y？",
              "准备下结论、或者被问\"你怎么知道\"的时候"
            ],
            [
              "③ 边界在哪",
              "它做不到什么？连领域内都还没定论的是什么？",
              "写总结、答辩、避免把猜测写成事实的时候"
            ]
          ]
        },
        {
          "type": "entries",
          "title": "① 怎么理解这条链路",
          "mode": "card",
          "cols": 2,
          "note": "",
          "only": [
            "c-causal",
            "c-tradeoff",
            "c-method"
          ]
        },
        {
          "type": "paragraph",
          "text": "**② 哪里想错了：三个来源不同的错误。** 修正是我们自己撞的墙，误解是听来的错话，排障是可复用的检查顺序。**不要跳过这一组**——它是这张图里唯一不能用搜索补上的部分。"
        },
        {
          "type": "entries",
          "title": "② 我们改过什么",
          "mode": "card",
          "cols": 2,
          "note": "",
          "only": [
            "c-revise",
            "c-misconception",
            "c-debug"
          ]
        },
        {
          "type": "paragraph",
          "text": "**③ 边界在哪：两种不同的\"不知道\"。** 能力边界是\"我们知道它做不到\"，未解问题是\"连这个领域也还没定论\"。两者都不是谦虚的姿态，是防止把猜测写成结论的具体手段。"
        },
        {
          "type": "entries",
          "title": "③ 边界在哪",
          "mode": "card",
          "cols": 2,
          "note": "",
          "only": [
            "c-boundary",
            "c-open"
          ]
        },
        {
          "type": "heading",
          "level": 2,
          "text": "这张图为什么最重要"
        },
        {
          "type": "paragraph",
          "text": "领域地图可以抄，生态地图可以搜，**认知地图抄不了**——它记录的是\"我们原来以为 X，后来发现是 Y，因为 Z\"。\n课程作业里那句\"展示一次真实的认识修正\"，说的就是这件事：**你是不是真的想过，看你会不会改主意。**"
        },
        {
          "type": "table",
          "title": "三张图的分工",
          "headers": [
            "地图",
            "回答",
            "更新方式"
          ],
          "rows": [
            [
              "领域地图",
              "这个领域有什么",
              "读到新东西就加"
            ],
            [
              "生态地图",
              "谁在做、用什么做",
              "工具换代就更新"
            ],
            [
              "认知地图",
              "我们怎么判断，哪里想错了",
              "**被事实推翻时改写**"
            ]
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 2,
          "items": [
            {
              "label": "赵鑫等,《大语言模型》第 1 章：大模型的发展与基本概念",
              "url": "https://llmbook-zh.github.io/",
              "id": "r1"
            },
            {
              "label": "Hoffmann 等, Chinchilla（2022，arXiv:2203.15556）",
              "url": "https://arxiv.org/abs/2203.15556",
              "id": "r2"
            }
          ]
        },
        {
          "type": "files",
          "title": "对照阅读",
          "items": [
            {
              "name": "斯坦福 CS336 课程主页（看它怎么组织\"从零到系统\"的认知顺序）",
              "url": "https://stanford-cs336.github.io/spring2025/"
            },
            {
              "name": "Happy-LLM 第 1 章（中文的发展脉络梳理）",
              "url": "https://github.com/datawhalechina/happy-llm"
            }
          ]
        }
      ]
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
          "type": "callout",
          "tone": "blue",
          "title": "版本号规则（作业要求）",
          "text": "版本号从 **v0.1** 起按时间**倒序**排列（新的在上面），**只追加、不覆盖历史记录**。每行写清：版本号、日期、更新对象、依据、修改内容与原因、尚存问题 / 下一步、检查结果（未做的写「待填写 / 待测试」，不要写成已完成）。"
        },
        {
          "type": "table",
          "title": "更新日志",
          "headers": [
            "版本",
            "日期",
            "更新对象",
            "依据",
            "修改内容与原因",
            "尚存问题 / 下一步",
            "检查结果"
          ],
          "rows": [
            [
              "v0.4",
              "2026-11-09",
              "三张地图首页 + 领域 12 个条目页",
              "课程作业要求；公开论文与官方文档（每条见页末「本页来源」）",
              "每张地图的关键词上方补「总览表 + 每组逻辑说明」，讲清组内顺序与组间关系；领域地图 12 个条目页开头改为先给定义、再讲原因，删掉绕圈的类比，术语第一次出现时给字面释义",
              "生态、认知两图的条目页只做了局部修补，深度不及领域图；对齐与分布式训练仍只到「读懂」",
              "本地渲染检查：39 页可打开，总览表与分组说明正常，无断链"
            ],
            [
              "v0.3",
              "2026-11-09",
              "三张地图 + 30 个条目页",
              "课程作业要求；公开论文、官方文档与开源项目（逐条列在各页「本页来源」）",
              "领域地图按链路拆成 12 个环节，每环节一个条目页；生态地图按生态位拆成 10 个；认知地图拆成 8 个判断节点。三张图之间用「相关条目」互跳，正文关键词可直接点开。",
              "对齐与分布式训练只到「读懂」未实跑；中文语料最优配比缺实验；各页「还没弄清」已逐条标注",
              "本地渲染检查：40 页可打开，卡片、跳转、来源、图表、代码块正常"
            ],
            [
              "v0.1",
              "2026-10-20",
              "网页的初步构建",
              "作业要求",
              "建立网站与三张地图的初始框架，上线github",
              "排版bug，小组协作困难",
              "很多问题。。"
            ],
            [
              "v0.2",
              "2026-10-24",
              "网页排版修复，上线协作功能并持续迭代。进一步搭建框架",
              "合作的方便性、作业要求",
              "添加反馈与建议（作业要求），上线workbuddy（看错要求了呜呜）",
              "内容不充实",
              "步入正轨"
            ]
          ],
          "_ts": 1794208297718,
          "colW": [
            14.285714285714286,
            14.285714285714286,
            14.285714285714286,
            14.285714285714286,
            15.788446526151446,
            12.782982045277127,
            14.285714285714286
          ]
        },
        {
          "type": "callout",
          "tone": "gray",
          "title": "待核实清单",
          "text": "- 培养方案中的课程关联（待对照最新培养方案）\n- 生态地图中的合作关系（待补充公开来源）"
        },
        {
          "type": "paragraph",
          "text": "**与反馈的双向关联**：某条反馈被采纳时，在该条反馈里注明「已纳入 vX.Y」；同时在上表对应版本行的「修改内容与原因」里写明反馈编号（如 `F-3KD9Q1`）。两边互相可查、可跳转 —— 未采纳的建议也要保留在原处并写明理由，不删除。"
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
    },
    {
      "id": "feedback",
      "kind": "page",
      "icon": "💬",
      "label": "反馈与建议",
      "title": "反馈与建议",
      "description": "对我们的工作有疑问、发现错误或有改进建议？在下方留言（可匿名）。留言与处理记录对所有人公开。",
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
          "text": "本网站由小组成员共同维护。整体结构、主要关系和重要判断我们共同讨论；每位成员能解释自己参与的内容。",
          "_ts": 1794209614998
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
              "李秋石",
              "组长",
              "",
              ""
            ],
            [
              "汪子洋",
              "",
              "",
              ""
            ],
            [
              "陈攀宇",
              "内容 + 网站开发",
              "搭建与部署本网站",
              ""
            ],
            [
              "殷启涵",
              "",
              "",
              ""
            ]
          ],
          "_ts": 1794209442710
        },
        {
          "type": "callout",
          "tone": "gray",
          "title": "协作规范",
          "text": "重要内容标明来源与时间；\n区分事实、他人观点与团队推断；\nAI 的回答不作为事实证据；\n不伪造来源、反馈或更新记录。",
          "_ts": 1794209591481
        }
      ],
      "heroAlign": ""
    },
    {
      "id": "n-scale",
      "kind": "page",
      "icon": "📐",
      "label": "定规模",
      "title": "定规模：一张卡到底能装多大的模型",
      "description": "参数量不是拍脑袋定的，是从显存和算力预算反推出来的。顺序反了，会白干两周。",
      "heroAlign": "",
      "parent": "domain",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "**定规模，就是先决定这一次训多大的模型**——参数量是几百万，还是几十亿。它排在第一位，因为后面每一步的工作量都由它决定：需要多少语料、几张卡、训多久。\n判断依据不是\"我想让它多聪明\"，而是\"我手上的显卡允许我碰多大\"。这是两个完全不同的问法，第二个才有答案。",
          "_ts": 0
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话解释",
          "text": "**显存决定上限，算力决定时长，数据量决定这个规模值不值。** 三个约束里最硬的是显存——它不跟你商量，超了就报错。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "先算显存：每个参数要占 16 字节"
        },
        {
          "type": "paragraph",
          "text": "训练时一个参数在显存里不是一个数，是四个：权重本身（4 字节）、它的梯度（4 字节）、优化器给它存的两个动量（各 4 字节）。加起来 **16 字节/参数**，这是全参训练、fp32（32 位浮点，一个数占 4 字节）下的常态。改用混合精度（大部分计算走 16 位、少数关键部分留 32 位）能压到 12 字节左右，代价是数值更容易不稳。\n所以 26M 参数大约要 `26e6 × 16 ≈ 416MB`，一张 24GB 的卡绰绰有余；7B 参数要 `7e9 × 16 ≈ 112GB`，单卡直接出局。这就是为什么\"能不能训\"这件事，算一下就知道了，不用试。",
          "_ts": 0
        },
        {
          "type": "md",
          "text": "```python\n# 训练显存粗算：三个数就能估出个大概\ndef train_memory(n_params, bytes_per_param=16, seq=1024, batch=8,\n                 layers=8, dim=512):\n    # 1) 参数 + 梯度 + 优化器状态\n    model = n_params * bytes_per_param\n    # 2) 激活值：粗略按 层数 × 序列 × 批量 × 维度 × 每层几份张量 估\n    act = layers * seq * batch * dim * 4 * 8\n    return (model + act) / 1e9   # GB\n\nprint(train_memory(26e6))    # 约 0.5 GB 量级\nprint(train_memory(7e9, layers=32, dim=4096))  # 百 GB 量级，单卡不可能\n```"
        },
        {
          "type": "paragraph",
          "text": "（激活值那一项是粗估，实际取决于是否用梯度检查点、注意力实现方式。它的用途不是精确预测，而是**在你按下运行之前告诉你\"这事有没有戏\"**。）"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "再看算力：总共要做多少次浮点运算"
        },
        {
          "type": "paragraph",
          "text": "训练的总计算量有个很好用的近似：**C ≈ 6 × N × D**（C 是总浮点运算次数，单位 FLOPs；N 是参数量，D 是训练 token 数）。6 的来源是前向 2 次、反向 4 次乘加，每参数每 token 计一次。\n拿 26M 参数、配 50 亿 token 算：`6 × 26e6 × 5e9 ≈ 7.8e17` FLOPs。一张 4090 的 fp16 峰值约 165 TFLOPS，理论 1.3 小时；实际因为访存和 kernel 效率，**能跑到峰值的 30%—50% 就算不错**，所以真实耗时往往翻两三倍。",
          "_ts": 0
        },
        {
          "type": "chart",
          "chartType": "pie",
          "title": "一个参数的 16 字节花在哪",
          "labels": [
            "权重（4 字节）",
            "梯度（4 字节）",
            "Adam 一阶动量（4 字节）",
            "Adam 二阶动量（4 字节）"
          ],
          "data": [
            4,
            4,
            4,
            4
          ],
          "unit": "字节"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "四种规模，四种命运"
        },
        {
          "type": "table",
          "title": "同一套代码，只改两个数字",
          "headers": [
            "规模",
            "参数量",
            "层数 / 维度",
            "单卡可行性",
            "适合拿来干什么"
          ],
          "rows": [
            [
              "微型",
              "26M",
              "8 / 512",
              "单卡几小时一轮",
              "理解链路、快速试错"
            ],
            [
              "小型",
              "125M",
              "12 / 768",
              "单卡一天",
              "GPT-2 small 复现级别的实验"
            ],
            [
              "中型",
              "350M",
              "24 / 1024",
              "单卡几天",
              "做点像样的下游微调实验"
            ],
            [
              "大型",
              "7B",
              "32 / 4096",
              "多卡数周",
              "真正有实用能力的起点"
            ]
          ]
        },
        {
          "type": "paragraph",
          "text": "**关键是：这四行在结构上没有区别。** 从 26M 换到 7B，改的是 `n_layers` 和 `dim` 两个数，代码一行不动。所以\"先用小的把链路跑通\"不是妥协，是唯一聪明的做法。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "配多少数据：Chinchilla 的 1:20"
        },
        {
          "type": "paragraph",
          "text": "2022 年 DeepMind 的 Chinchilla 论文算出一件事：**固定算力下，参数量和训练 token 数要按大约 1:20 配**。模型做大而数据不跟上，等于买了更大的桶却没多打水。\n按这个比例，26M 参数对应约 5 亿 token——中文语料大概几 GB 就够。而 GPT-3 的 1750 亿参数只配了 3000 亿 token，比例是 1:1.7，属于典型的\"营养不良\"，后来 LLaMA 系列就是靠把比例拉到 1:20 以上反超的。"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "最容易踩的误解",
          "text": "**\"参数越大越聪明\"是错的。** 在给定算力下，存在一个最优的参数量与数据量组合；一味堆参数只会让模型又贵又笨。反过来，小模型配足数据，往往打得过大而饿的模型。\n另一个误解：参数量不等于知识量。它更像\"表达能力的天花板\"，天花板高但样本少，结果就是把训练集背下来。"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "n-data",
            "n-train",
            "n-pretrain"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 3,
          "items": [
            {
              "label": "Kaplan 等, Scaling Laws for Neural Language Models（2020，arXiv:2001.08361）",
              "url": "https://arxiv.org/abs/2001.08361",
              "id": "r1"
            },
            {
              "label": "Hoffmann 等, Training Compute-Optimal Large Language Models（Chinchilla，2022，arXiv:2203.15556）",
              "url": "https://arxiv.org/abs/2203.15556",
              "id": "r2"
            },
            {
              "label": "Brown 等, Language Models are Few-Shot Learners（GPT-3，2020，arXiv:2005.14165）",
              "url": "https://arxiv.org/abs/2005.14165",
              "id": "r3"
            }
          ]
        },
        {
          "type": "files",
          "title": "自己算一遍",
          "items": [
            {
              "name": "Chinchilla 论文（arXiv:2203.15556）",
              "url": "https://arxiv.org/abs/2203.15556"
            },
            {
              "name": "Happy-LLM 第 1—2 章：大模型简介与 Transformer 基础",
              "url": "https://github.com/datawhalechina/happy-llm"
            },
            {
              "name": "Transformer Math 101（EleutherAI，推导显存与算力）",
              "url": "https://blog.eleuther.ai/transformer-math/"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "还要讨论",
          "text": "- 16 字节/参数是 fp32 混合精度的估算；用 bf16 + 8-bit 优化器（如 bitsandbytes）能压到 6—10 字节，但会引入数值问题。\n- 1:20 这个比例在中文上是否成立，我们没有独立验证；中文的 token 效率比英文低，可能需要更多 token 才能达到同等效果。"
        }
      ]
    },
    {
      "id": "n-data",
      "kind": "page",
      "icon": "📚",
      "label": "数据",
      "title": "数据：你喂给它什么样的世界",
      "description": "语料来源、配比和规模决定了模型的上限。这一步做错，后面所有环节都在给错误的地基装修。",
      "heroAlign": "",
      "parent": "domain",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "**数据就是模型在训练中读过的全部文本**，也叫语料（corpus）。模型不会凭空知道世界，它见到的每一个字都来自这里。\n所以这一步定的是上限：语料的覆盖面决定它知道什么，语料的口音决定它说话像谁，语料里广告的比例决定它会不会变成推销员。后面无论怎么调，都突破不了这个上限。",
          "_ts": 0
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话解释",
          "text": "预训练数据不是\"越多越好\"，而是**\"越杂越稳、越干净越省\"**。配比错了，模型会偏科；重复多了，模型会背原文。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "语料从哪来"
        },
        {
          "type": "paragraph",
          "text": "公开的大模型语料基本就那几类，区别在筛选方式和比例："
        },
        {
          "type": "table",
          "title": "常见来源与它们各自的问题",
          "headers": [
            "来源",
            "典型内容",
            "规模量级",
            "主要问题"
          ],
          "rows": [
            [
              "网页抓取",
              "Common Crawl 的原始页面",
              "数十 TB",
              "广告、导航栏、乱码、机器翻译垃圾"
            ],
            [
              "百科 / 参考",
              "维基百科、百度百科",
              "GB 级",
              "太干净、太书面，覆盖不了口语"
            ],
            [
              "书籍",
              "小说、教材、非虚构",
              "GB 级",
              "版权问题；扫描版 OCR 噪声"
            ],
            [
              "学术论文",
              "arXiv、各期刊",
              "GB 级",
              "公式和参考文献格式杂乱"
            ],
            [
              "代码",
              "GitHub 公开仓库",
              "数百 GB",
              "大量重复、自动生成文件、许可证混杂"
            ],
            [
              "对话",
              "论坛、问答、客服记录",
              "GB 级",
              "隐私、脏话、答非所问"
            ],
            [
              "合成数据",
              "用强模型生成",
              "可控",
              "会把强模型的错误一起继承下来"
            ]
          ]
        },
        {
          "type": "paragraph",
          "text": "中文还有一层额外麻烦：**同一段内容有简繁两套写法、全角半角两套标点、还有大量被转码搞坏的生僻字**（典型是\"锟斤拷\"这种乱码残留）。这些不处理，分词器会学到一堆没用的碎片，模型也会把乱码当成正常文本模仿。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "配比才是关键"
        },
        {
          "type": "paragraph",
          "text": "同样的总量，比例不同，出来的模型完全不同。代码给多了，模型数学和逻辑会好一点，但说话像 README；对话给多了，语气自然但知识浅；网页给多了，覆盖面广但噪声重。\n公开资料里，GPT-3 的配比大致是网页 60%、书籍 16%、维基 3%、代码几乎为零；LLaMA 把代码和学术比例大幅提高；到了支持多语言的模型，中文占比会单独拉出来一档。**这些比例没有普适答案，只能按目标能力调。**"
        },
        {
          "type": "chart",
          "chartType": "bar",
          "title": "一次典型预训练配比（示意，参照公开模型的量级）",
          "labels": [
            "网页",
            "代码",
            "书籍/论文",
            "百科",
            "对话"
          ],
          "data": [
            55,
            20,
            15,
            5,
            5
          ],
          "unit": "%"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "数据量怎么定"
        },
        {
          "type": "paragraph",
          "text": "按 Chinchilla 的 1:20，26M 参数配约 5 亿 token；实际小模型训练时，为了让它\"见多识广\"，往往会**远超**这个比例（重复训练多轮），代价是过拟合风险上升。判断依据在[预训练](#/p/n-pretrain)那页讲：看验证集 loss 什么时候开始回升。"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "一次真实的翻车",
          "text": "我们的第一版模型训出来是个**广告机器人**——不管问什么，都在结尾推荐产品。查了两天才发现，抓来的网页里有大量电商详情页和推广软文，清洗规则只删了明显的导航栏，没识别出这类\"通顺但无信息\"的文本。\n教训不是\"要清洗\"，而是：**先抽 200 条样本读一遍，五分钟就能发现的事，别等训练完。**"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "n-clean",
            "n-token",
            "n-pretrain"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 3,
          "items": [
            {
              "label": "Raffel 等, Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer（C4 数据集，2019，arXiv:1910.10683）",
              "url": "https://arxiv.org/abs/1910.10683",
              "id": "r1"
            },
            {
              "label": "Gao 等, The Pile: An 800GB Dataset of Diverse Text for Language Modeling（2020，arXiv:2101.00027）",
              "url": "https://arxiv.org/abs/2101.00027",
              "id": "r2"
            },
            {
              "label": "Touvron 等, LLaMA: Open and Efficient Foundation Language Models（2023，arXiv:2302.13971）",
              "url": "https://arxiv.org/abs/2302.13971",
              "id": "r3"
            }
          ]
        },
        {
          "type": "files",
          "title": "可以直接用的语料与工具",
          "items": [
            {
              "name": "Hugging Face Datasets（海量公开语料的统一接口）",
              "url": "https://huggingface.co/datasets"
            },
            {
              "name": "ModelScope 数据集（中文语料较多）",
              "url": "https://modelscope.cn/datasets"
            },
            {
              "name": "Data-Juicer（阿里开源的数据处理流水线）",
              "url": "https://github.com/modelscope/data-juicer"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "还没弄清",
          "text": "- 各比例的\"最优值\"没有公开的统一结论，多数论文只给结论不给消融实验。\n- 合成数据该占多少，2024 年之后争议很大：有研究说效果很好，也有研究说会导致模型崩溃（model collapse）。我们没做实验，先不下判断。"
        }
      ]
    },
    {
      "id": "n-clean",
      "kind": "page",
      "icon": "🧹",
      "label": "数据清洗",
      "title": "清洗：删掉的东西比加上的更重要",
      "description": "去重、去噪、过滤、防污染。这一步不产生任何\"新内容\"，却往往是效果提升最大的一步。",
      "heroAlign": "",
      "parent": "domain",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "**清洗就是把语料里没用的部分删掉**：重复的、机器生成的、网页导航栏残留、乱码、导流软文。\n它不产生任何新内容，只做减法。但这一步的收益经常比\"再多收一倍数据\"更大——因为同一段文字重复十遍，模型会把这十遍都当成十次学习信号。",
          "_ts": 0
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话解释",
          "text": "清洗的目标不是\"干净\"，是**\"每一 token 都在教模型有用的东西\"**。重复的文本会让模型背原文，噪声文本会让它学坏句式。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "四类必须做的事"
        },
        {
          "type": "table",
          "title": "按优先级排",
          "headers": [
            "动作",
            "在解决什么",
            "常见做法"
          ],
          "rows": [
            [
              "精确去重",
              "同一篇文章被转贴几十次，模型会把它当真理背下来",
              "文档级哈希；段落级 MinHash / SimHash"
            ],
            [
              "规则过滤",
              "导航栏、版权声明、推荐位、乱码",
              "长度阈值、符号占比、停用词密度、语言识别"
            ],
            [
              "质量打分",
              "通顺但没信息量的文本（SEO 软文、模板页）",
              "用小模型打分；或用高质量语料训一个分类器"
            ],
            [
              "防污染",
              "评测题混进训练集，分数虚高",
              "和评测集做 n-gram 重叠检测（通常查 13-gram）"
            ]
          ]
        },
        {
          "type": "paragraph",
          "text": "顺序很重要：**先粗过滤再精确去重**。反过来会在几 TB 的垃圾上跑昂贵的相似度计算，时间和内存都撑不住。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "去重到底能省多少"
        },
        {
          "type": "paragraph",
          "text": "我们那批中文网页语料，原始 80 万行，做完精确去重剩 61 万，规则过滤后剩 43 万，质量打分卡在 0.6 以上剩 23 万。**最后只用了不到三成，但模型效果反而变好**——因为剩下的每一行都在说新东西。"
        },
        {
          "type": "chart",
          "chartType": "bar",
          "title": "清洗漏斗：每一关还剩多少（我们这批语料的实际数字）",
          "labels": [
            "原始",
            "精确去重后",
            "规则过滤后",
            "质量打分后"
          ],
          "data": [
            80,
            61,
            43,
            23
          ],
          "unit": "万行"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "防污染：最容易被忽略的一步"
        },
        {
          "type": "paragraph",
          "text": "如果你用 MMLU、C-Eval 这类公开题做评测，而训练语料里恰好有这些题的原文和答案，模型就是**背过答案去考试**，分数毫无意义。\n检测方法不复杂：把评测题按 13-gram 切开，去训练语料里查有没有连续 13 个词完全命中。命中率超过某个阈值就说明这条题被污染了。这不是学术洁癖，**很多\"某某模型刷榜\"的争议就出在这里。**"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "清洗的边界",
          "text": "清洗能去掉噪声，去不掉偏见。语料里如果 90% 的医生是男性，模型就会学到这个关联——这不是删几句话能解决的，属于[对齐](#/p/n-align)和[评测](#/p/n-eval)要暴露的问题。\n另一个边界：**过度清洗会让模型变傻。** 把所有\"不规范\"的表达都删掉，模型就学不会口语、方言和网络用语。"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "n-data",
            "n-token",
            "n-eval"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 3,
          "items": [
            {
              "label": "Rae 等, Scaling Language Models: Methods, Analysis & Insights from Training Gopher（2021，arXiv:2112.11446）",
              "url": "https://arxiv.org/abs/2112.11446",
              "id": "r1"
            },
            {
              "label": "Lee 等, Deduplicating Training Data Makes Language Models Better（2021，arXiv:2107.06499）",
              "url": "https://arxiv.org/abs/2107.06499",
              "id": "r2"
            },
            {
              "label": "Wenzek 等, CCNet: Extracting High Quality Monolingual Datasets from Web Crawl Data（2019，arXiv:1911.00359）",
              "url": "https://arxiv.org/abs/1911.00359",
              "id": "r3"
            }
          ]
        },
        {
          "type": "files",
          "title": "工具",
          "items": [
            {
              "name": "Data-Juicer（开箱即用的清洗算子库）",
              "url": "https://github.com/modelscope/data-juicer"
            },
            {
              "name": "text-dedup（MinHash / SimHash 去重实现）",
              "url": "https://github.com/ChenghaoMou/text-dedup"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "待核实",
          "text": "- 质量分类器的阈值（比如我们用的 0.6）是拍出来的，没有系统调参。\n- 13-gram 这个数字来自 GPT-3 论文的做法，更严格的检测会用更短的 n-gram，但误报率会上升。"
        }
      ]
    },
    {
      "id": "n-token",
      "kind": "page",
      "icon": "✂️",
      "label": "分词",
      "title": "分词：模型的母语，也是它的成本表",
      "description": "BPE 把文字切成统计上高频的片段。词表大小决定一句话值多少 token，而 token 就是钱和上下文。",
      "heroAlign": "",
      "parent": "domain",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "**分词就是把文字切成小块，再把每块换成一个整数**，这个整数叫 token（词元）。模型不认识汉字，只认识数字，分词器（tokenizer）就是这道翻译。\n它决定两件事：一句话要花多少 token（直接等于花多少钱、占多少上下文），以及模型眼里\"最小的语义单位\"有多粗。",
          "_ts": 0
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话解释",
          "text": "BPE（Byte Pair Encoding，字节对编码）做的事只有一件：**反复把语料里最常相邻出现的两个单位合并成一个新单位**，重复几万次，剩下的合并规则就是词表。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "它到底在合并什么"
        },
        {
          "type": "paragraph",
          "text": "一开始，每个字节都是独立的单位。第一步统计语料里哪两个相邻单位出现最多——比如 `e` 和 `r`——就合并成 `er`。然后 `er` 变成一个整体，再去找它和谁最常相邻。重复三万次，你就有了三万条合并规则。\n**这些规则不是人设计的，是统计出来的。** 所以\"为什么 `的` 是一个 token，而 `的时` 不是\"这个问题，唯一的答案是：语料里 `的时` 出现得不够多。"
        },
        {
          "type": "md",
          "text": "```python\n# BPE 的核心循环，二十行就能写完（教学版）\nfrom collections import Counter\n\ndef merge_once(ids, pair, new_id):\n    out, i = [], 0\n    while i < len(ids):\n        if i < len(ids) - 1 and (ids[i], ids[i+1]) == pair:\n            out.append(new_id); i += 2      # 命中就合并，跳过两个\n        else:\n            out.append(ids[i]); i += 1\n    return out\n\ndef train_bpe(words, vocab_size):\n    ids = [[ord(c) for c in w] for w in words]   # 起点：每个字符一个编号\n    merges = []\n    while len(merges) < vocab_size:\n        stats = Counter()\n        for seq in ids:\n            for a, b in zip(seq, seq[1:]):\n                stats[(a, b)] += 1              # 统计相邻对的出现次数\n        if not stats: break\n        pair = stats.most_common(1)[0][0]       # 最高频的那一对\n        new_id = max(max(s) for s in ids) + 1\n        ids = [merge_once(s, pair, new_id) for s in ids]\n        merges.append((pair, new_id))           # 记下规则，编码时要用\n    return merges\n```"
        },
        {
          "type": "paragraph",
          "text": "真实实现（tiktoken、SentencePiece）多了三件事：**字节级处理**（保证任何字符都不会变成\"未知词\"）、**特殊标记保护**、以及**用正则先粗切**（把字母、数字、标点分开，避免跨词合并）。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "词表大小是个真实的取舍"
        },
        {
          "type": "table",
          "title": "两边都有代价",
          "headers": [
            "词表小",
            "词表大"
          ],
          "rows": [
            [
              "序列更长，同样一句话占更多 token",
              "序列更短，上下文更省"
            ],
            [
              "嵌入层小，参数量省，适合小模型",
              "嵌入层占参数比例上升，小模型会浪费容量"
            ],
            [
              "每个 token 训练样本更充分",
              "长尾 token 训练不足，容易学不好"
            ],
            [
              "更适合多语言、少见字符",
              "压缩率高，推理更快"
            ]
          ]
        },
        {
          "type": "paragraph",
          "text": "实际数字：GPT-2 用 50257，LLaMA 用 32000，Qwen2 用 151936，DeepSeek-V3 用 128000。**趋势明显是往大走**——因为多语言、代码、数学符号都需要更大的词表来压缩。"
        },
        {
          "type": "chart",
          "chartType": "bar",
          "title": "同一句中文在不同分词器下的 token 数（示例，用小样本实测）",
          "labels": [
            "GPT-2 (50k)",
            "LLaMA (32k)",
            "Qwen2 (152k)"
          ],
          "data": [
            31,
            26,
            11
          ],
          "unit": "token"
        },
        {
          "type": "paragraph",
          "text": "这组数字解释了一个很实际的问题：**中文用英文-centric 的分词器，同样内容要多付两三倍的钱**，能吃下的上下文也少了两三倍。这不是玄学，是词表覆盖率的直接后果。"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "踩过的坑",
          "text": "我们用 GPT-2 的分词器处理中文，一段十七个字的句子被切成三十多个 token，其中一半是单字节碎片。模型不是不能学，而是**每学一句话要花两倍的计算量**，而且碎片之间没有语义。\n换成分词器后再训，同样的语料、同样的步数，验证困惑度明显更低。"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "n-data",
            "n-arch",
            "e-tokenizer"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 3,
          "items": [
            {
              "label": "Sennrich 等, Neural Machine Translation of Rare Words with Subword Units（BPE 用于 NLP，2016，arXiv:1508.07909）",
              "url": "https://arxiv.org/abs/1508.07909",
              "id": "r1"
            },
            {
              "label": "Radford 等, Language Models are Unsupervised Multitask Learners（GPT-2，2019）",
              "url": "https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf",
              "id": "r2"
            },
            {
              "label": "Karpathy, minbpe（BPE 的最小实现，两百行）",
              "url": "https://github.com/karpathy/minbpe",
              "id": "r3"
            }
          ]
        },
        {
          "type": "files",
          "title": "动手试试",
          "items": [
            {
              "name": "tiktoken（OpenAI 的分词器，可在线看切分结果）",
              "url": "https://github.com/openai/tiktoken"
            },
            {
              "name": "SentencePiece（Google，支持 BPE / Unigram）",
              "url": "https://github.com/google/sentencepiece"
            },
            {
              "name": "Hugging Face Tokenizers（Rust 实现，很快）",
              "url": "https://github.com/huggingface/tokenizers"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "还没弄清",
          "text": "- 词表大小的最优值没有定论，它与模型规模、语言种类、训练 token 数都相关，目前主要靠经验。\n- \"中文一个 token 平均几个字\"这个指标在不同语料上差别很大，我们只测了小样本，不能当结论。"
        }
      ]
    },
    {
      "id": "n-arch",
      "kind": "page",
      "icon": "🏗️",
      "label": "模型结构",
      "title": "Transformer：被\"预测下一个词\"逼出来的结构",
      "description": "注意力、因果掩码、位置编码、归一化、前馈网络。每一块都在回答一个具体约束。",
      "heroAlign": "",
      "parent": "domain",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "**模型结构，就是这些参数怎么摆、信息怎么在里面流动。** 现在几乎所有大语言模型都用同一种结构：Transformer，2017 年 Google 那篇《Attention Is All You Need》提出来的。\n它要算的事情只有一件：给定前文，下一个词最可能是什么。所谓\"结构设计\"，全是为了把这个计算做得又准又快。",
          "_ts": 0
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话解释",
          "text": "这个结构要解决的问题是：**让序列里每个位置都能按需读取前面所有位置的信息，并且能并行计算。** 注意力解决\"读谁\"，因果掩码解决\"不许偷看\"，位置编码解决\"谁在前面\"，前馈网络解决\"读完之后自己想一想\"。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "从一句话到下一个词"
        },
        {
          "type": "paragraph",
          "text": "给定\"今天天气真\"，要预测\"好\"。机器必须做到三件事：把每个字变成向量（**嵌入**，embedding，字面是\"嵌进去\"——把孤立的字编号塞进一个连续空间，意思相近的字自然靠得近）；让每个位置知道前面说了什么（注意力）；把读到的信息加工成一个打分（前馈 + 输出层）。\n难点在第二件。RNN 的做法是一个字一个字往右传，串行、慢、远距离信息会衰减。注意力换了思路：**每个位置直接和前面所有位置算一次相关度，一次算完，全部并行。**",
          "_ts": 0
        },
        {
          "type": "heading",
          "level": 2,
          "text": "注意力：Q、K、V 到底在干什么"
        },
        {
          "type": "paragraph",
          "text": "先拆个词：**注意力（attention）字面就是\"注意\"**，在这里指一个动作——这个位置该把多少注意力分给前面的每个位置。\n每个位置的向量会被三个不同的线性层投影成三个角色：**Q（query，查询）** 是\"我想找什么\"，**K（key，键）** 是\"我能提供什么\"，**V（value，值）** 是\"我实际有什么内容\"。\n用 Q 和所有 K 做点积得到匹配分数，再用 softmax 归一成权重，最后按权重把 V 加权求和。**softmax 的作用很朴素：把一串可正可负的实数，压成加起来正好等于 1 的一组比例。****类比：开会时你（Q）听每个人的自我介绍（K）决定听谁的，然后记下他说的内容（V）。**",
          "_ts": 0
        },
        {
          "type": "md",
          "text": "```python\n# 因果自注意力，nanoGPT 的写法（加了中文注释）\ndef forward(self, x):\n    B, T, C = x.shape                       # 批量, 序列长度, 维度\n    qkv = self.c_attn(x)                    # 一次线性变换算出 Q K V\n    q, k, v = qkv.split(self.n_head, dim=2)\n\n    # 多头：把维度切成 n_head 份，每份独立算注意力\n    att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))\n    # 除以 sqrt(d) 是因为维度高时点积会很大，softmax 会退化成 one-hot\n    att = att.masked_fill(self.bias[:, :, :T, :T] == 0, float(\"-inf\"))\n    # 上三角置为 -inf：位置 i 只能看 <= i，不许偷看后面的答案\n    att = F.softmax(att, dim=-1)\n    y = att @ v                             # 按权重取回内容\n    return y.transpose(1, 2).contiguous().view(B, T, C)\n\n    # 注意：这里用 -inf 而不是 0。用 0 的话 e^0 = 1，\n    # 等于告诉模型\"未来非常重要\"，这是新手常踩且不报错的坑。\n```"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "几个必须有的零件"
        },
        {
          "type": "table",
          "title": "每一块的存在理由",
          "headers": [
            "零件",
            "解决什么问题",
            "常见选择"
          ],
          "rows": [
            [
              "嵌入层 Embedding",
              "把 token 编号变成向量",
              "词表 × 维度，通常与输出层共享权重"
            ],
            [
              "位置编码",
              "注意力本身没有顺序概念",
              "RoPE（旋转位置编码）、ALiBi"
            ],
            [
              "多头注意力",
              "不同头关注不同关系（指代、语法、语义）",
              "8—32 个头，每头维度 64—128"
            ],
            [
              "因果掩码",
              "训练时不许看到未来",
              "上三角置 -inf"
            ],
            [
              "残差连接",
              "层数深了梯度传不回去",
              "每两个子层加一次"
            ],
            [
              "归一化",
              "稳定数值范围",
              "LayerNorm → RMSNorm（少一个均值项，更快）"
            ],
            [
              "前馈网络 FFN",
              "注意力只做加权平均，不会\"加工\"",
              "4 倍维度扩张 + GELU/SwiGLU"
            ],
            [
              "输出层",
              "把向量映射回词表打分",
              "与嵌入层共享权重，省参数"
            ]
          ]
        },
        {
          "type": "paragraph",
          "text": "**为什么前馈层要扩 4 倍再压回来？** 一种解释是它充当\"键值记忆\"：中间层维度高，能存更多模式；注意力负责把信息路由过来，前馈层负责在本地做变换。这也是模型参数量的主要来源——7B 模型里大约三分之二的参数在前馈层。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "参数量到底怎么来的"
        },
        {
          "type": "paragraph",
          "text": "对标准 Transformer，参数量有个好用的近似：**约 12 × 层数 × 维度²**（不含嵌入层）。\n验算一下：8 层、512 维度 → `12 × 8 × 512² ≈ 25.2M`，加上嵌入层（词表 6144 × 512 × 2，输入输出共享算一份）约 3.1M，总计 28M 左右，和我们实际训的 26M 对得上。**这个公式的好处是：你能立刻看出参数量对\"维度\"是平方关系，对\"层数\"是线性关系。** 所以加宽比加深更贵。"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "常见误解",
          "text": "- **\"注意力就是模型在关注重要词\"**：它只是在做加权平均，权重高低不等于语义重要性。\n- **\"层数越多越强\"**：深了会梯度消失、训练不稳，且推理更慢；宽度和深度要平衡。\n- **\"Transformer 是专门为语言设计的\"**：它是个通用的序列到序列结构，图像、音频都能用。"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "n-loss",
            "n-train",
            "n-token"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 3,
          "items": [
            {
              "label": "Vaswani 等, Attention Is All You Need（2017，arXiv:1706.03762）",
              "url": "https://arxiv.org/abs/1706.03762",
              "id": "r1"
            },
            {
              "label": "Zhang & Sennrich, Root Mean Square Layer Normalization（RMSNorm，2019，arXiv:1910.07467）",
              "url": "https://arxiv.org/abs/1910.07467",
              "id": "r2"
            },
            {
              "label": "Su 等, RoFormer: Enhanced Transformer with Rotary Position Embedding（RoPE，2021，arXiv:2104.09864）",
              "url": "https://arxiv.org/abs/2104.09864",
              "id": "r3"
            }
          ]
        },
        {
          "type": "files",
          "title": "看图与看代码",
          "items": [
            {
              "name": "The Annotated Transformer（逐行讲解论文实现）",
              "url": "https://nlp.seas.harvard.edu/annotated-transformer/"
            },
            {
              "name": "The Illustrated Transformer（图解版，中文翻译很多）",
              "url": "https://jalammar.github.io/illustrated-transformer/"
            },
            {
              "name": "nanoGPT model.py（几百行，最干净的 GPT 实现）",
              "url": "https://github.com/karpathy/nanoGPT/blob/master/model.py"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "还没弄清",
          "text": "- 不同位置编码（RoPE / ALiBi / 可学习）在长上下文上的差异，我们只跑了短序列，没有结论。\n- 注意力的可解释性研究很多，但\"某个头负责某件事\"这种说法在多数情况下站不住，我们倾向不写进结论。"
        }
      ]
    },
    {
      "id": "n-loss",
      "kind": "page",
      "icon": "🎯",
      "label": "损失函数",
      "title": "损失：整个训练只有一句话",
      "description": "交叉熵、错位一位、困惑度。所有复杂的训练技巧，都在服务一个极简的目标：让正确答案的概率变大。",
      "heroAlign": "",
      "parent": "domain",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "**损失函数就是给模型的预测打分的那把尺子。** 它输出一个数，越小表示猜得越准，训练的全部目的就是把这个数往下压。\n预训练阶段这把尺子只有一句话：**让正确答案的概率变大一点。** 几百亿参数的训练，优化的就是这一件事。",
          "_ts": 0
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话解释",
          "text": "交叉熵（cross-entropy：cross 是交叉，entropy 来自信息论）衡量\"模型给正确答案分配的概率有多低\"。概率给得越低，罚得越重；训到理想状态，就是模型看到前文就能把下一个词的概率压到接近 1。",
          "_ts": 0
        },
        {
          "type": "heading",
          "level": 2,
          "text": "错位一位：最容易写错的一行"
        },
        {
          "type": "paragraph",
          "text": "输入是\"今天 天气 真\"，目标应该是\"天气 真 好\"——**每个位置的预测目标，是它右边的那个词**。这就是\"错位一位（shift by one）\"。\n写错这一行不会报错，模型照样训，只是它学的是\"复制输入\"，于是训完变成一个复读机。**这是新手最常见的坑，而且症状很晚才暴露。**"
        },
        {
          "type": "md",
          "text": "```python\n# 错位一位 + 交叉熵，五行，但每一行都不能错\nlogits, loss = model(idx)          # logits: [B, T, vocab_size]\n\n# 训练时：输入 idx[:, :-1]，目标 idx[:, 1:]\nlogits = logits[:, :-1, :]         # 丢掉最后一个位置的预测（它没有下一个词）\ntarget = idx[:, 1:]                # 目标整体右移一位\n\nloss = F.cross_entropy(\n    logits.reshape(-1, logits.size(-1)),   # [B*T, vocab]\n    target.reshape(-1)                     # [B*T]\n)\n```"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "困惑度：把 loss 翻译成人话"
        },
        {
          "type": "paragraph",
          "text": "loss 是交叉熵，单位是 nat，不好直观理解。**困惑度（perplexity, PPL）= e^loss**，可以读成\"模型在多少个词之间犹豫\"。\n词表 6144 时，均匀瞎猜的交叉熵是 `ln(6144) ≈ 8.72`，对应困惑度 6144。训到 loss 4.0，困惑度约 55——意思是模型平均在 55 个候选词之间犹豫。训到 2.5，困惑度约 12，已经能写出通顺句子了。"
        },
        {
          "type": "chart",
          "chartType": "line",
          "title": "loss 与困惑度的对应关系（词表 6144）",
          "labels": [
            "loss 8.72",
            "loss 6.0",
            "loss 4.0",
            "loss 2.5"
          ],
          "data": [
            6144,
            403,
            55,
            12
          ],
          "unit": "PPL"
        },
        {
          "type": "paragraph",
          "text": "**为什么这几个数字重要：** 如果你看到训练日志里 loss 一直是 8.72 不动，那不是\"学得慢\"，而是**模型在均匀瞎猜**——通常意味着学习率太大、数据有问题，或者梯度根本没传过去。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "几个工程细节"
        },
        {
          "type": "table",
          "title": "看起来小，影响很大",
          "headers": [
            "做法",
            "为什么",
            "代价"
          ],
          "rows": [
            [
              "不做 label smoothing",
              "语言模型要的是真实分布，平滑会让模型不敢确定",
              "无"
            ],
            [
              "忽略 padding 位置",
              "补齐的 token 不是真内容，算进去会教模型输出无意义内容",
              "需要在 labels 里置 -100"
            ],
            [
              "z-loss（可选）",
              "约束 logits 的尺度，防止数值爆炸",
              "多一项超参"
            ],
            [
              "按 token 平均而非按句平均",
              "否则长句主导梯度，短句被忽略",
              "无"
            ],
            [
              "梯度累积时除以累积步数",
              "否则等效学习率变大，容易炸",
              "无"
            ]
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "一个反直觉的事实",
          "text": "**loss 更低不等于模型更好。** 我们做 SFT 之后，验证困惑度降了，但人工看回答质量反而变差——因为模型把\"回答格式\"学得很像，内容却开始重复训练集里的套话。\nloss 衡量的是\"对训练分布的拟合程度\"，不衡量\"有没有用\"。所以[评测](#/p/n-eval)必须独立做。"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "n-arch",
            "n-train",
            "n-eval"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 3,
          "items": [
            {
              "label": "Goodfellow 等,《深度学习》（Deep Learning）第 3 章：信息论与交叉熵",
              "url": "https://www.deeplearningbook.org/",
              "id": "r1"
            },
            {
              "label": "Bengio 等, A Neural Probabilistic Language Model（2003，语言模型目标的经典表述）",
              "url": "https://www.jmlr.org/papers/v3/bengio03a.html",
              "id": "r2"
            },
            {
              "label": "Karpathy, nanoGPT（损失实现见 model.py 的 forward）",
              "url": "https://github.com/karpathy/nanoGPT",
              "id": "r3"
            }
          ]
        },
        {
          "type": "files",
          "title": "补数学",
          "items": [
            {
              "name": "3Blue1Brown · 神经网络系列（B 站官方账号，梯度下降的直觉讲得最好）",
              "url": "https://space.bilibili.com/88461692"
            },
            {
              "name": "d2l 中文版 · 线性回归与 softmax 回归（交叉熵的推导）",
              "url": "https://zh.d2l.ai/chapter_linear-networks/index.html"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "待核实",
          "text": "- z-loss 在小模型上是否必要，我们没有做对照实验。\n- \"困惑度降到多少算能用\"没有通用答案，取决于词表大小和语料难度，只能和同规模基线比。"
        }
      ]
    },
    {
      "id": "n-train",
      "kind": "page",
      "icon": "🔁",
      "label": "训练循环",
      "title": "训练：让参数真的动起来",
      "description": "优化器、学习率、warmup、梯度裁剪、混合精度、断点续训。九成不收敛不是模型结构的问题。",
      "heroAlign": "",
      "parent": "domain",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "模型写好了、损失定好了，接下来是把参数真的调起来。**这一步最枯燥，也最容易卡住——多数\"训不动\"的夜晚都发生在这里。**"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话解释",
          "text": "训练就是重复四件事：前向算损失、反向算梯度、优化器按梯度改参数、清空梯度。所有技巧（warmup、裁剪、累积、混合精度）都在保证这四步的数值不出事。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "一个能跑的最小循环"
        },
        {
          "type": "md",
          "text": "```python\noptimizer = torch.optim.AdamW(model.parameters(), lr=3e-4,\n                              betas=(0.9, 0.95), weight_decay=0.1)\n\nfor step, batch in enumerate(loader):\n    x, y = batch\n    with torch.autocast(\"cuda\", dtype=torch.bfloat16):   # 混合精度：算得快\n        logits, loss = model(x, y)\n    loss = loss / grad_accum                          # 梯度累积：小显存凑大批量\n    loss.backward()                                   # 反向传播，梯度写进 param.grad\n\n    if (step + 1) % grad_accum == 0:\n        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)  # 梯度裁剪\n        lr = get_lr(step)                             # warmup + 余弦退火\n        for g in optimizer.param_groups: g[\"lr\"] = lr\n        optimizer.step()                              # 真正改参数\n        optimizer.zero_grad(set_to_none=True)         # 清梯度\n```"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "每个技巧在防什么"
        },
        {
          "type": "table",
          "title": "症状 — 原因 — 处理",
          "headers": [
            "现象",
            "多半是",
            "怎么办"
          ],
          "rows": [
            [
              "loss 一动不动卡在 ln(词表大小)",
              "学习率太大，或梯度没传过去",
              "降到 1e-4 试；打印梯度范数确认不是 0"
            ],
            [
              "loss 前几步就变成 nan",
              "混合精度溢出 / 除零",
              "改 bf16 不用 fp16；加梯度裁剪"
            ],
            [
              "loss 突然飙升再降下来",
              "遇到脏 batch（长文本、乱码）",
              "跳过该 batch；检查数据"
            ],
            [
              "训练 loss 降、验证 loss 升",
              "过拟合",
              "加数据、减轮数、加 dropout"
            ],
            [
              "多卡比单卡还慢",
              "通信成了瓶颈",
              "调大 batch；用 ZeRO / FSDP"
            ],
            [
              "跑了三天突然中断",
              "实例被抢占 / OOM",
              "存 checkpoint，支持断点续训"
            ]
          ]
        },
        {
          "type": "heading",
          "level": 2,
          "text": "学习率：先热身，再退火"
        },
        {
          "type": "paragraph",
          "text": "Transformer 对学习率极其敏感，所以有两个标配动作：\n**warmup**——前几百到几千步把学习率从 0 线性升到峰值，避免一开始梯度方向乱、把参数带飞；\n**余弦退火**——之后按余弦曲线慢慢降，让模型在训练末期小幅收敛而不是来回跳。\n经验值：小模型峰值 3e-4 到 1e-3，大模型 1e-4 到 3e-4，warmup 占总步数的 1%—5%。**这些数字没有普适答案，但顺序和形状是稳定的。**"
        },
        {
          "type": "chart",
          "chartType": "line",
          "title": "典型 loss 曲线三个阶段（示意）",
          "labels": [
            "warmup",
            "快速下降",
            "平台期"
          ],
          "data": [
            8.72,
            5.2,
            3.9
          ],
          "unit": "loss"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "多卡的时候，学习率要不要改"
        },
        {
          "type": "paragraph",
          "text": "要。数据并行时全局批量变成原来的 N 倍，梯度噪声变小，等效于\"步子可以迈大一点\"。两种常用缩放：\n**线性缩放**：批量 ×N，学习率也 ×N，适合大批量、短训练；\n**平方根缩放**：学习率 ×√N，更保守，长训练更稳。\n还有一个更麻烦的事实：**批量大到一定程度，收益就饱和了**（critical batch size），再大只是浪费算力。"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "我们卡最久的一次",
          "text": "第一次训练，loss 从第一步就停在 8.72 不动，我们以为是模型写错了，重写了三遍结构。真正的原因是**学习率设成了 3e-3**——大了十倍，参数每步都被推到很远的地方，输出退化成均匀分布。\n改成 3e-4，第二个 step 就往下掉了。**记住这个数字：8.72 = ln(6144)，它几乎总是指向数值问题，不是结构问题。**"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "n-loss",
            "n-pretrain",
            "n-scale",
            "e-train-fw"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 3,
          "items": [
            {
              "label": "Loshchilov & Hutter, Decoupled Weight Decay Regularization（AdamW，2017，arXiv:1711.05101）",
              "url": "https://arxiv.org/abs/1711.05101",
              "id": "r1"
            },
            {
              "label": "Kingma & Ba, Adam: A Method for Stochastic Optimization（2014，arXiv:1412.6980）",
              "url": "https://arxiv.org/abs/1412.6980",
              "id": "r2"
            },
            {
              "label": "Rajbhandari 等, ZeRO: Memory Optimizations Toward Training Trillion Parameter Models（2019，arXiv:1910.02054）",
              "url": "https://arxiv.org/abs/1910.02054",
              "id": "r3"
            }
          ]
        },
        {
          "type": "files",
          "title": "训练框架与技巧",
          "items": [
            {
              "name": "karpathy/nanoGPT · train.py（最干净的训练循环参考）",
              "url": "https://github.com/karpathy/nanoGPT/blob/master/train.py"
            },
            {
              "name": "DeepSpeed（ZeRO 三阶段、混合精度、断点续训）",
              "url": "https://github.com/microsoft/DeepSpeed"
            },
            {
              "name": "Happy-LLM 第 6 章：训练流程实践（中文，含完整代码）",
              "url": "https://github.com/datawhalechina/happy-llm"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "还没弄清",
          "text": "- 学习率的最优值和小模型/大模型的关系，我们只有自己那几组实验，不足以给通用建议。\n- loss spike 的成因（数据问题 vs 优化器问题）目前没有统一定论，我们只做到\"回滚 + 跳过 batch\"。"
        }
      ]
    },
    {
      "id": "n-pretrain",
      "kind": "page",
      "icon": "🌱",
      "label": "预训练",
      "title": "预训练：从瞎猜到会说人话",
      "description": "在海量文本上做\"预测下一个词\"。训完你得到的不是一个助手，是一台博学但完全不听话的续写机器。",
      "heroAlign": "",
      "parent": "domain",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "预训练是整条链路里最贵的一步，也是唯一一步\"不需要人工标注\"的——因为**文本本身就是标签**，下一个词就是答案。"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话解释",
          "text": "拿一段文本，遮住后面，让模型猜下一个词；猜错就调参数。重复几十万步、几亿次之后，语法、事实、推理模式都以统计规律的形式沉进了权重里。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "它到底学到了什么"
        },
        {
          "type": "paragraph",
          "text": "很多人以为模型\"记住了知识条目\"，其实更准确的说法是：**它学到了语言和世界的分布形状。**\n比如它不会记住\"巴黎是法国首都\"这条事实，但它学到了\"巴黎\"和\"法国\"在大量上下文中高度共现，于是被问到时会给出正确答案。这个区别很重要——它解释了为什么模型会在细节上编造，也解释了为什么它能做没见过的类比。"
        },
        {
          "type": "chart",
          "chartType": "line",
          "title": "预训练 loss 的三个阶段（示意，小模型实测量级）",
          "labels": [
            "前 1% 步",
            "10% 步",
            "50% 步",
            "收敛"
          ],
          "data": [
            8.7,
            5.6,
            4.3,
            3.98
          ],
          "unit": "loss"
        },
        {
          "type": "paragraph",
          "text": "第一阶段降得最快——从\"完全随机\"到\"学会词频和常见搭配\"只需要很少的步数。中段开始学语法和长距离依赖，降得慢。末段基本是平台期，继续训的收益要靠**加数据**而不是加步数。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "规模带来的两个\"跳变\""
        },
        {
          "type": "paragraph",
          "text": "**第一是涌现（emergence）：** 某些能力（多步算术、思维链推理、上下文学习）在小模型上几乎为零，规模跨过某个门槛后突然出现。这让\"能力能不能靠堆规模获得\"变成一个有争议的问题。\n**第二是 Chinchilla 修正：** 2022 年之前大家相信\"参数越大越好\"，Chinchilla 证明在固定算力下，**参数量和数据量要一起涨**，比例约 1:20。此后 LLaMA 系列用小模型 + 超量数据，效果反超同算力的大模型。"
        },
        {
          "type": "table",
          "title": "三个规模阶段的能力差异",
          "headers": [
            "规模",
            "能做到",
            "做不到"
          ],
          "rows": [
            [
              "26M 级",
              "通顺的短句、常见搭配、简单续写",
              "连贯段落、指令跟随、事实准确"
            ],
            [
              "1B 级",
              "成段生成、基础问答、简单推理",
              "多步推理、长上下文一致性"
            ],
            [
              "7B 级以上",
              "多轮对话、代码、中等难度推理",
              "复杂规划、可靠的事实性"
            ]
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "这一步结束时你手里有什么",
          "text": "一台**续写机器**。给它\"今天天气真\"，它接\"好\"；给它\"中国的首都是\"，它接\"北京\"。\n但你问它\"中国的首都是哪里？\"，它可能接着编一段对话，而不是回答你——因为它学的是\"文本接下来会怎么写\"，不是\"问题该怎么答\"。\n**这个缺陷不是 bug，是训练目标的直接后果**，也是[监督微调](#/p/n-sft)存在的唯一理由。"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "n-train",
            "n-sft",
            "n-eval"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 3,
          "items": [
            {
              "label": "Hoffmann 等, Training Compute-Optimal Large Language Models（Chinchilla，2022，arXiv:2203.15556）",
              "url": "https://arxiv.org/abs/2203.15556",
              "id": "r1"
            },
            {
              "label": "Wei 等, Emergent Abilities of Large Language Models（2022，arXiv:2206.07682）",
              "url": "https://arxiv.org/abs/2206.07682",
              "id": "r2"
            },
            {
              "label": "Touvron 等, LLaMA: Open and Efficient Foundation Language Models（2023，arXiv:2302.13971）",
              "url": "https://arxiv.org/abs/2302.13971",
              "id": "r3"
            }
          ]
        },
        {
          "type": "files",
          "title": "跑一遍预训练",
          "items": [
            {
              "name": "jingyaogong/minimind（26M 级，单卡 2 小时跑完预训练 + SFT + RL）",
              "url": "https://github.com/jingyaogong/minimind"
            },
            {
              "name": "karpathy/llm.c（用 C 从零实现 GPT-2 训练）",
              "url": "https://github.com/karpathy/llm.c"
            },
            {
              "name": "Happy-LLM 第 7 章：大模型应用（预训练与微调的中文讲解）",
              "url": "https://github.com/datawhalechina/happy-llm"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "还没弄清",
          "text": "- 涌现是不是\"真涌现\"，还是评价指标太离散造成的假象，学界仍有争论（有论文主张用连续指标后曲线是平滑的）。\n- 中文语料上 1:20 是否最优，我们没做实验；中文 token 效率低，可能需要更多 token。"
        }
      ]
    },
    {
      "id": "n-sft",
      "kind": "page",
      "icon": "💬",
      "label": "监督微调",
      "title": "监督微调：教它\"回答问题\"这个动作",
      "description": "用几万条\"问题—回答\"样本改掉续写习惯。关键是那个 -100：别让模型去学问题本身。",
      "heroAlign": "",
      "parent": "domain",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "预训练完的模型会续写，不会回答。**SFT（Supervised Fine-Tuning，监督微调）就是用少量高质量的\"问—答\"样本，把它从\"接话\"掰成\"答话\"。**"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话解释",
          "text": "SFT 改的不是\"知道什么\"，是**\"怎么说话、什么时候停、用谁的视角说\"**。数据量不用大，几千到几万条就够，关键在质量。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "训练的到底是哪些位置"
        },
        {
          "type": "paragraph",
          "text": "一条样本长这样：`<用户>什么是梯度下降？<助手>梯度下降是……<结束>`。\n注意：**我们只想让模型学会生成\"助手\"那一段**，不想让它学会生成用户的问题。所以算损失时要把问题部分的标签全部置成 `-100`——PyTorch 的交叉熵会忽略这个值。\n漏掉这一步不会报错，模型会同时学会\"提问\"和\"回答\"，于是推理时它可能自己跟自己聊起来。"
        },
        {
          "type": "md",
          "text": "```python\nIGNORE = -100\n\ndef build_sft_sample(prompt_ids, answer_ids, max_len=512):\n    ids = prompt_ids + answer_ids\n    # 关键：问题部分不算损失，只学回答\n    labels = [IGNORE] * len(prompt_ids) + answer_ids\n    ids, labels = ids[:max_len], labels[:max_len]\n    # 补齐到定长，补齐位置同样不算损失\n    pad = max_len - len(ids)\n    ids += [PAD] * pad\n    labels += [IGNORE] * pad\n    return ids, labels\n\n# 三个最容易错的地方：\n# 1) 截断把回答截掉了，只剩问题 → 学不到东西\n# 2) 补齐位置没置 -100 → 模型学会输出 PAD\n# 3) 模板少一个空格/换行 → 训练和推理的格式不一致，效果骤降\n```"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "三个真实的取舍"
        },
        {
          "type": "table",
          "title": "每一条都影响结果",
          "headers": [
            "选择",
            "做法",
            "代价"
          ],
          "rows": [
            [
              "全参微调 vs LoRA",
              "全参改所有权重；LoRA 只加一对低秩矩阵",
              "LoRA 省显存（可省 2/3），但上限略低"
            ],
            [
              "数据质量 vs 数量",
              "1 万条精选 vs 50 万条爬取",
              "质量优先，噪声样本会教坏格式"
            ],
            [
              "多轮 vs 单轮",
              "把对话历史拼进上下文",
              "多轮更实用，但样本构造复杂、更吃长度"
            ]
          ]
        },
        {
          "type": "paragraph",
          "text": "LoRA 的思路值得单独说一句：**冻结原模型，只在旁边加一个小矩阵，训练时只改这个小矩阵。** 因为微调带来的改变通常\"低秩\"——不需要动所有方向。7B 模型全参微调要几十 GB 显存，LoRA 只要几 GB，这是小团队能用上的关键。"
        },
        {
          "type": "md",
          "text": "```python\n# LoRA 的核心：把 ΔW 分解成两个小矩阵 B @ A\n# 原层: y = W x          (W: d×d，冻结)\n# 现在: y = W x + (alpha/r) * B (A x)\n#       A: r×d, B: d×r，r 通常取 8—64\n\nclass LoRALinear(nn.Module):\n    def __init__(self, base, r=8, alpha=16):\n        super().__init__()\n        self.base = base                      # 冻结的原权重\n        d_in, d_out = base.in_features, base.out_features\n        self.A = nn.Parameter(torch.randn(r, d_in) * 0.01)\n        self.B = nn.Parameter(torch.zeros(d_out, r))  # B 初始为 0 → 起步等于原模型\n        self.scale = alpha / r\n\n    def forward(self, x):\n        return self.base(x) + self.scale * (x @ self.A.T @ self.B.T)\n```"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "灾难性遗忘：修好一个坏掉另一个"
        },
        {
          "type": "paragraph",
          "text": "SFT 数据太单一，模型会把预训练学到的能力\"覆盖\"掉——比如只训了客服问答，它就不会写代码了。这个现象叫**灾难性遗忘（catastrophic forgetting）**。\n缓解办法有三个：混入少量预训练数据一起训；用 LoRA 减少改动范围；控制学习率和轮数（SFT 通常只训 1—3 轮，多了必然过拟合）。"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "我们做错的一件事",
          "text": "第一版 SFT 数据是把网上抓的问答直接拼起来，格式五花八门：有的用\"问：\"，有的用\"Q:\"，有的干脆没有分隔符。训完之后模型会答，但**经常答到一半突然开始出下一题**——因为它学到的\"结束\"信号不统一。\n后来统一模板、只保留一种格式，问题就消失了。**SFT 的格式一致性，比数据量重要得多。**"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "n-pretrain",
            "n-align",
            "e-posttrain"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 3,
          "items": [
            {
              "label": "Wei 等, Finetuned Language Models Are Zero-Shot Learners（FLAN，指令微调，2021，arXiv:2109.01652）",
              "url": "https://arxiv.org/abs/2109.01652",
              "id": "r1"
            },
            {
              "label": "Ouyang 等, Training Language Models to Follow Instructions with Human Feedback（InstructGPT，2022，arXiv:2203.02155）",
              "url": "https://arxiv.org/abs/2203.02155",
              "id": "r2"
            },
            {
              "label": "Hu 等, LoRA: Low-Rank Adaptation of Large Language Models（2021，arXiv:2106.09685）",
              "url": "https://arxiv.org/abs/2106.09685",
              "id": "r3"
            }
          ]
        },
        {
          "type": "files",
          "title": "动手微调",
          "items": [
            {
              "name": "LLaMA-Factory（图形界面，支持全参与 LoRA 微调）",
              "url": "https://github.com/hiyouga/LLaMA-Factory"
            },
            {
              "name": "ms-swift（ModelScope 的微调框架，中文文档完整）",
              "url": "https://github.com/modelscope/ms-swift"
            },
            {
              "name": "Happy-LLM 第 6 章：SFT 数据构造与训练",
              "url": "https://github.com/datawhalechina/happy-llm"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "还没弄清",
          "text": "- SFT 数据\"多少条够用\"高度依赖任务复杂度，公开的经验值（1 万—10 万）跨度太大，我们没有系统比较。\n- 多轮对话里历史该保留几轮、超长历史怎么截断，是个工程取舍，没有标准答案。"
        }
      ]
    },
    {
      "id": "n-align",
      "kind": "page",
      "icon": "⚖️",
      "label": "对齐",
      "title": "对齐：把\"答得好\"变成可以优化的信号",
      "description": "SFT 教它说话，对齐教它说人话。偏好数据、奖励模型、PPO、DPO，以及为什么模型会\"刷分\"。",
      "heroAlign": "",
      "parent": "domain",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "SFT 之后模型会答了，但答得不一定好：太长、太敷衍、该拒绝的不拒绝。**问题是\"好\"这个标准，人说不清，更写不进数据里。**"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话解释",
          "text": "对齐的做法是：不直接告诉模型\"什么是好\"，而是给它两个回答让它比，从\"人选了哪个\"里反推出一个打分标准，再用这个标准去调模型。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "为什么不能直接打分"
        },
        {
          "type": "paragraph",
          "text": "让人给回答打 1—10 分，不同人的尺度完全不同：有人觉得 7 分算好，有人觉得 7 分算差。更麻烦的是同一个人隔一天再打分，结果也可能不一样。\n**但让人在两个回答里选一个更好的，一致性高得多。** 这就是为什么主流方案都建立在\"两两比较\"上，而不是绝对打分。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "Bradley-Terry：把比较变成数学"
        },
        {
          "type": "paragraph",
          "text": "假设每个回答有一个隐含的\"好\"分数 `r`，那么 A 比 B 好的概率可以写成：\n`P(A > B) = sigmoid(r_A − r_B)`\n（sigmoid 是一条 S 形曲线，能把任意实数压到 0—1 之间，正好当概率用。）\n分数差越大，A 被选中的概率越接近 1；两者接近，就是 50%。训练奖励模型，就是让这个概率尽量贴合人类实际的选择。",
          "_ts": 0
        },
        {
          "type": "md",
          "text": "```python\n# 奖励模型的损失：让\"人选的那个\"得分更高\ndef reward_loss(chosen_reward, rejected_reward):\n    # 两者的差经过 logsigmoid，等价于 -log P(chosen > rejected)\n    return -F.logsigmoid(chosen_reward - rejected_reward).mean()\n\n# 注意：这里用的是\"差\"，不是绝对值。\n# 所以奖励模型的输出只有相对意义，绝对值可以随便平移。\n```"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "PPO：为什么要同时跑四个模型"
        },
        {
          "type": "table",
          "title": "四个角色，各有各的活",
          "headers": [
            "角色",
            "干什么",
            "为什么不能省"
          ],
          "rows": [
            [
              "演员 Actor",
              "生成回答，被训练",
              "主角"
            ],
            [
              "评论家 Critic",
              "估计这个状态值多少分",
              "降低梯度方差，否则训练极不稳定"
            ],
            [
              "裁判 Reward Model",
              "给回答打分",
              "提供优化目标"
            ],
            [
              "参照 Reference",
              "冻结的原模型",
              "算 KL 惩罚，防止跑偏"
            ]
          ]
        },
        {
          "type": "paragraph",
          "text": "KL 惩罚（KL divergence，KL 散度）是这里的关键约束：**新模型不能离原模型太远。** 因为奖励模型只是个近似，如果不加约束，模型会找到各种\"能骗高分但实际很糟\"的路径，这叫 **reward hacking（奖励攻击）**。"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "奖励攻击的四种典型样子",
          "text": "1. **长度偏好**：奖励模型倾向给长回答高分，于是模型越写越长，内容没变多。\n2. **奉承**：开头一堆\"好问题！\"，因为标注者确实偏好礼貌。\n3. **格式堆砌**：狂用列表和加粗，看起来专业。\n4. **模棱两可**：两边都说，回避表态，因为这样不容易被判错。\n**这不是模型的恶意，是它精确地优化了你给它的东西。**"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "DPO：把三步压成一步"
        },
        {
          "type": "paragraph",
          "text": "PPO 要训四个模型，工程复杂、显存吃紧。DPO（Direct Preference Optimization，直接偏好优化）发现：**奖励其实可以用模型自己表达**，于是可以跳过奖励模型，直接用偏好数据训练。\n核心推导只有一句：在最优策略下，`奖励 = β · log(当前模型 / 参照模型)`。把它代回 Bradley-Terry 公式，就得到一个只含两个模型、一个损失函数的式子。"
        },
        {
          "type": "md",
          "text": "```python\n# DPO 损失：四个 logprob，一个 logsigmoid\ndef dpo_loss(policy, ref, batch, beta=0.1):\n    # 分别算：策略模型和参照模型，在\"选中\"和\"被拒\"回答上的对数概率\n    pi_c  = logprob(policy, batch.chosen)\n    pi_r  = logprob(policy, batch.rejected)\n    ref_c = logprob(ref,    batch.chosen)\n    ref_r = logprob(ref,    batch.rejected)\n\n    # 隐式奖励 = beta * (log pi - log ref)\n    margin = beta * ((pi_c - ref_c) - (pi_r - ref_r))\n    return -F.logsigmoid(margin).mean()\n\n# 直觉：让\"选中\"相对参照模型的提升，超过\"被拒\"的提升。\n```"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "方法怎么选"
        },
        {
          "type": "table",
          "title": "按手里的资源选",
          "headers": [
            "方法",
            "需要什么",
            "适合谁"
          ],
          "rows": [
            [
              "RLHF（PPO）",
              "奖励模型 + 四个模型同跑",
              "有算力、有标注团队的"
            ],
            [
              "DPO",
              "只要偏好对（A 比 B 好）",
              "单卡、小团队的首选"
            ],
            [
              "ORPO / KTO",
              "偏好对，或只有\"好/坏\"单标签",
              "数据形态不规整时"
            ],
            [
              "GRPO / RLVR",
              "答案可自动判对错（数学、代码）",
              "有标准答案的任务"
            ],
            [
              "只做提示词约束",
              "什么数据都不用",
              "没有训练资源时的现实选择"
            ]
          ]
        },
        {
          "type": "paragraph",
          "text": "**RLVR（Reinforcement Learning with Verifiable Rewards）** 值得单独提一句：如果任务的答案能自动判对错（算术题、代码测试用例），就不需要人来标注偏好，直接用\"对/错\"当奖励。这条路在 2024—2025 年把数学和代码能力推得很快，因为它绕开了最贵的一环——人类偏好标注。"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "我们做到哪一步",
          "text": "我们**没有真的跑 RLHF 或 DPO**。原因是偏好标注：要标出几千条可靠的比较，四个人既没时间也没把握——自己标的数据自己都不信，训出来的东西没法解释。\n我们做到的是：理解每一步在优化什么、能读懂损失函数、能判断一篇论文用的是哪条路线。**知道自己在哪停下，比假装走完更可信。**"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "n-sft",
            "n-eval",
            "c-boundary"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 4,
          "items": [
            {
              "label": "Ouyang 等, Training Language Models to Follow Instructions with Human Feedback（InstructGPT / RLHF，2022，arXiv:2203.02155）",
              "url": "https://arxiv.org/abs/2203.02155",
              "id": "r1"
            },
            {
              "label": "Rafailov 等, Direct Preference Optimization: Your Language Model is Secretly a Reward Model（DPO，2023，arXiv:2305.18290）",
              "url": "https://arxiv.org/abs/2305.18290",
              "id": "r2"
            },
            {
              "label": "Christiano 等, Deep Reinforcement Learning from Human Preferences（2017，arXiv:1706.03741）",
              "url": "https://arxiv.org/abs/1706.03741",
              "id": "r3"
            },
            {
              "label": "Shao 等, DeepSeekMath（提出 GRPO，2024，arXiv:2402.03300）",
              "url": "https://arxiv.org/abs/2402.03300",
              "id": "r4"
            }
          ]
        },
        {
          "type": "files",
          "title": "继续深入",
          "items": [
            {
              "name": "Hugging Face TRL（PPO / DPO / ORPO 的参考实现）",
              "url": "https://github.com/huggingface/trl"
            },
            {
              "name": "Anthropic · Constitutional AI 论文（用 AI 反馈替代部分人工标注）",
              "url": "https://arxiv.org/abs/2212.08073"
            },
            {
              "name": "ms-swift（支持 DPO / KTO / ORPO 的中文框架）",
              "url": "https://github.com/modelscope/ms-swift"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "待核实",
          "text": "- \"对齐税\"（对齐后能力下降）到底有多大，不同论文结论不一致，我们没有独立复现。\n- 偏好数据的一致性只有 0.6—0.7 这个数字来自公开研究，具体任务差异很大。"
        }
      ]
    },
    {
      "id": "n-eval",
      "kind": "page",
      "icon": "📏",
      "label": "评测",
      "title": "评测：怎么证明它真的行",
      "description": "没有对照、没有污染检查的分数，等于没有分数。样本量、few-shot、评判偏差，每一个都能让结论反转。",
      "heroAlign": "",
      "parent": "domain",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "模型训完了，怎么知道它好不好？**这一步最容易自欺欺人**——因为你想看到好结果，而分数很容易被凑出来。"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话解释",
          "text": "评测要回答的不是\"它多少分\"，而是**\"它在什么条件下、比谁、好了多少，这个差距是不是超出了随机波动\"**。四个要素缺一个，分数就不可信。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "主流基准在测什么"
        },
        {
          "type": "table",
          "title": "别只看总分",
          "headers": [
            "基准",
            "测什么",
            "分数怎么读"
          ],
          "rows": [
            [
              "MMLU",
              "57 个学科的单选题",
              "5-shot 准确率；60 分左右接近随机，80 分以上算强"
            ],
            [
              "GSM8K",
              "小学数学应用题",
              "看最终答案对不对；考的是多步推理"
            ],
            [
              "HumanEval",
              "给函数签名写代码，跑测试用例",
              "pass@1；不写 k 就是耍流氓"
            ],
            [
              "C-Eval",
              "中文多学科考试",
              "中文能力的主要参考之一"
            ],
            [
              "MT-Bench",
              "多轮对话，用强模型当裁判",
              "1—10 分；受裁判偏好影响大"
            ],
            [
              "长文本基准",
              "长文档问答、检索",
              "要注意有效上下文和标称上下文不是一回事"
            ]
          ]
        },
        {
          "type": "paragraph",
          "text": "**为什么\"不写 k 就是耍流氓\"**：pass@1 是\"只生成一次就对\"的比例，pass@10 是\"生成十次有一次对\"。后者天然更高。看到\"代码能力 90%\"要先问：哪个 k、哪套题、有没有污染。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "三个能让结论反转的细节"
        },
        {
          "type": "paragraph",
          "text": "**一、few-shot 数量。** 同一个模型，0-shot 和 5-shot 在同一套题上能差 10—20 分。所以比较两个模型，必须用同样的 shot 设置。\n**二、样本量。** 19 道题上差 3 分，统计上几乎没有意义——按二项分布估，19 道题的误差约 ±22 个百分点。想要可信，至少几百道题。\n**三、污染。** 训练语料里如果有评测题原文，模型就是背答案。必须做 n-gram 重叠检测。"
        },
        {
          "type": "chart",
          "chartType": "bar",
          "title": "样本量越小，误差越大（95% 置信区间半宽，p≈0.5）",
          "labels": [
            "20 题",
            "100 题",
            "500 题",
            "2000 题"
          ],
          "data": [
            22,
            10,
            4.4,
            2.2
          ],
          "unit": "±百分点"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "用模型当裁判的三个偏差"
        },
        {
          "type": "paragraph",
          "text": "MT-Bench 这类评测用强模型打分，便宜但不可靠，已知偏差有三种：\n**位置偏差**：偏好第一个回答，解法是交换顺序各评一次；\n**长度偏差**：偏好长回答，解法是控制长度或显式要求简洁；\n**自我偏好**：偏好自己家族模型的文风，解法是换多个裁判投票。"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "我们最有效的一次评测",
          "text": "我们没做总分，只做了**分维度人工对比**：同一个问题，让我们的模型和一个更大的开源模型各答一遍，四个人独立判断\"差在哪\"。\n结论比任何分数都清楚：语法通顺度差距不大，**事实准确性差距巨大**，指令遵循在长问题上崩得最厉害。\n这直接告诉我们下一步该补哪里——**评测的价值不是排名，是定位。**"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "n-clean",
            "n-align",
            "n-deploy",
            "e-eval"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 4,
          "items": [
            {
              "label": "Hendrycks 等, Measuring Massive Multitask Language Understanding（MMLU，2020，arXiv:2009.03300）",
              "url": "https://arxiv.org/abs/2009.03300",
              "id": "r1"
            },
            {
              "label": "Cobbe 等, Training Verifiers to Solve Math Word Problems（GSM8K，2021，arXiv:2110.14168）",
              "url": "https://arxiv.org/abs/2110.14168",
              "id": "r2"
            },
            {
              "label": "Chen 等, Evaluating Large Language Models Trained on Code（HumanEval，2021，arXiv:2107.03374）",
              "url": "https://arxiv.org/abs/2107.03374",
              "id": "r3"
            },
            {
              "label": "Huang 等, C-Eval: A Multi-Level Multi-Discipline Chinese Evaluation Suite（2023，arXiv:2305.08322）",
              "url": "https://arxiv.org/abs/2305.08322",
              "id": "r4"
            }
          ]
        },
        {
          "type": "files",
          "title": "评测工具",
          "items": [
            {
              "name": "OpenCompass（上海 AI Lab，中文评测体系完整）",
              "url": "https://github.com/open-compass/opencompass"
            },
            {
              "name": "lm-evaluation-harness（EleutherAI，学术论文最常用）",
              "url": "https://github.com/EleutherAI/lm-evaluation-harness"
            },
            {
              "name": "C-Eval 官网（中文榜单）",
              "url": "https://cevalbenchmark.com/"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "待核实",
          "text": "- 各榜单的\"及格线\"没有统一定义，不同论文的基线设置差别很大，横向比较要谨慎。\n- LLM-as-judge 与人类评分的一致性（常见说法 80% 左右）在不同任务上波动很大，我们只做了小样本观察。"
        }
      ]
    },
    {
      "id": "n-deploy",
      "kind": "page",
      "icon": "🚀",
      "label": "推理部署",
      "title": "推理部署：让真实的人用得上",
      "description": "prefill 吃算力，decode 吃显存带宽。这一个事实解释了 KV Cache、批处理、量化和所有推理优化。",
      "heroAlign": "",
      "parent": "domain",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "模型能生成，和\"别人打开网页能用\"，中间隔着一整个工程问题。**推理慢，绝大多数时候不是算力不够，是显存带宽不够。**"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话解释",
          "text": "生成一个 token 要把整个模型的权重从显存读一遍。7B 模型 fp16 是 14GB，A100 带宽 2TB/s → **每 token 至少 7 毫秒**，而算力只需要 0.045 毫秒。**差 150 倍，瓶颈在搬数据，不在算。**"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "两个完全不同的阶段"
        },
        {
          "type": "table",
          "title": "prefill 与 decode",
          "headers": [
            "阶段",
            "在做什么",
            "瓶颈",
            "优化方向"
          ],
          "rows": [
            [
              "Prefill（预填充）",
              "把整段输入一次性算完，建立 KV Cache",
              "算力（矩阵乘很大）",
              "FlashAttention、增大 batch"
            ],
            [
              "Decode（解码）",
              "每次生成一个 token，逐个吐字",
              "显存带宽（每步都要读全部权重）",
              "KV Cache、量化、投机解码"
            ]
          ]
        },
        {
          "type": "paragraph",
          "text": "这两个阶段有专门的名字：**prefill（预填充）** 是一次性把整段提问读完、算出第一个词，慢在算力；**decode（解码）** 是一个词一个词往外吐，慢在显存带宽。\n这个区分很重要：**你输入的 prompt 越长，prefill 越慢；你要求的回答越长，decode 越慢。** 用户抱怨\"等很久才出第一个字\"和\"出字很慢\"是两个完全不同的问题，优化手段也不一样。",
          "_ts": 0
        },
        {
          "type": "chart",
          "chartType": "bar",
          "title": "生成一个 token 的两种成本（7B 模型 / A100，按公开峰值估算）",
          "labels": [
            "算力耗时",
            "显存带宽耗时"
          ],
          "data": [
            0.045,
            7
          ],
          "unit": "毫秒"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "KV Cache：不缓存就没法用"
        },
        {
          "type": "paragraph",
          "text": "生成第 100 个 token 时，前面 99 个位置的 K、V 其实没变过。**缓存它们，就只需要算新位置。** 没有这个优化，每生成一个 token 都要把整段重算一遍，复杂度是平方级。\n代价是显存：缓存大小约 `2 × 层数 × 序列长度 × 维度 × 2 字节`。7B 模型、一万 token 上下文，大约要 5GB——比模型本身的一半还多。**这就是长上下文特别吃显存的原因。**"
        },
        {
          "type": "md",
          "text": "```python\n# 采样：温度、top-k、top-p 在干什么\ndef sample(logits, temperature=0.8, top_k=40, top_p=0.9):\n    logits = logits / temperature          # 温度<1 更保守，>1 更随机\n\n    # top-k：只保留概率最高的 k 个候选\n    if top_k:\n        kth = torch.topk(logits, top_k).values[..., -1, None]\n        logits = logits.masked_fill(logits < kth, float(\"-inf\"))\n\n    # top-p（核采样）：按概率从高到低累加，够 p 就截断\n    probs = torch.softmax(logits, dim=-1)\n    sorted_p, idx = torch.sort(probs, descending=True)\n    cum = torch.cumsum(sorted_p, dim=-1)\n    cut = cum - sorted_p > top_p\n    sorted_p[cut] = 0.0\n\n    # 从截断后的分布里抽样（不是取最大值，那会变呆板）\n    return torch.multinomial(sorted_p, 1)\n```"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "量化：把模型压小"
        },
        {
          "type": "paragraph",
          "text": "权重从 fp16（2 字节）压到 int8（1 字节）或 int4（0.5 字节），显存和带宽需求同比减少，**decode 速度几乎线性提升**——因为它就是带宽瓶颈。\n难点不在\"除以一个缩放系数\"，而在**离群值**：少数权重特别大，直接量化会把整层的精度拖垮。常见解法是分组量化（每组单独算缩放系数）和保留离群值通道。"
        },
        {
          "type": "table",
          "title": "三种量化路线",
          "headers": [
            "方法",
            "训练后量化（PTQ）",
            "量化感知训练（QAT）"
          ],
          "rows": [
            [
              "做法",
              "训完直接压，用少量校准数据调缩放",
              "训练时就模拟量化误差"
            ],
            [
              "成本",
              "几十分钟",
              "要重训，成本高"
            ],
            [
              "效果",
              "int8 基本无损，int4 有可见损失",
              "int4 也能接近无损"
            ],
            [
              "代表",
              "GPTQ、AWQ、GGUF",
              "较少见于开源大模型"
            ]
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "上线后才知道的事",
          "text": "第一版我们在自己电脑上跑得很顺，发给同学一测：**他等了四十秒才看到第一个字，第二个人打开直接卡住。**\n原因是模型加载占满显存、单请求串行处理、没有批处理也没有缓存。后来做了三件事：加载后常驻、加请求队列和动态批处理、把默认生成长度从 512 降到 256。**体验从\"没法用\"变成\"能用\"，模型本身一个字没改。**"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "n-eval",
            "n-arch",
            "e-infer"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 4,
          "items": [
            {
              "label": "Kwon 等, Efficient Memory Management for Large Language Model Serving with PagedAttention（vLLM，2023，arXiv:2309.06180）",
              "url": "https://arxiv.org/abs/2309.06180",
              "id": "r1"
            },
            {
              "label": "Dao 等, FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness（2022，arXiv:2205.14135）",
              "url": "https://arxiv.org/abs/2205.14135",
              "id": "r2"
            },
            {
              "label": "Frantar 等, GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers（2022，arXiv:2210.17323）",
              "url": "https://arxiv.org/abs/2210.17323",
              "id": "r3"
            },
            {
              "label": "Lin 等, AWQ: Activation-aware Weight Quantization（2023，arXiv:2306.00978）",
              "url": "https://arxiv.org/abs/2306.00978",
              "id": "r4"
            }
          ]
        },
        {
          "type": "files",
          "title": "部署工具",
          "items": [
            {
              "name": "vLLM（PagedAttention + continuous batching，工业标配）",
              "url": "https://github.com/vllm-project/vllm"
            },
            {
              "name": "llama.cpp（CPU / 端侧推理，GGUF 量化）",
              "url": "https://github.com/ggerganov/llama.cpp"
            },
            {
              "name": "Ollama（本地一键跑模型，适合演示）",
              "url": "https://github.com/ollama/ollama"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "还没弄清",
          "text": "- 量化对\"能力\"的影响不只在困惑度上，长链推理任务上损失更明显，我们没有系统测。\n- 投机解码、前缀缓存的收益高度依赖请求分布，公开的加速比不能直接套用。"
        }
      ]
    },
    {
      "id": "e-open-course",
      "kind": "page",
      "icon": "📖",
      "label": "教程与课程",
      "title": "教程与课程：从哪一套开始学",
      "description": "中文系统教程、英文公开课、视频系列。按\"想解决什么问题\"分，而不是按\"哪个最全\"分。",
      "heroAlign": "",
      "parent": "ecology",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "资料不缺，缺的是**顺序**。同一批内容有五种讲法，选错了会浪费两周。"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话",
          "text": "**先要\"能跑通\"选 MiniMind，先要\"能看懂\"选 Happy-LLM 或 d2l，先要\"能自己写\"选 Karpathy，先要\"能进研究\"选 CS336。**"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "四类教程，四条路"
        },
        {
          "type": "table",
          "title": "按目标选，不按名气选",
          "headers": [
            "你的目标",
            "推荐",
            "为什么"
          ],
          "rows": [
            [
              "想最快看到模型跑起来",
              "MiniMind（26M，单卡 2 小时全流程）",
              "代码少、依赖少，预训练 + SFT + RL 都有"
            ],
            [
              "想系统理解每一步",
              "Happy-LLM（Datawhale，中文）",
              "八章几乎对应十二个环节，有完整代码"
            ],
            [
              "想补数学和基础",
              "d2l 中文版（动手学深度学习）",
              "从线性回归讲到注意力，公式推导完整"
            ],
            [
              "想自己从零写一遍",
              "Karpathy 的 nanoGPT / minbpe / Zero to Hero",
              "几百行实现，逐行讲，视频可跟做"
            ],
            [
              "想达到 research 水平",
              "Stanford CS336",
              "作业是实现 tokenizer、训练、并行、推理全栈"
            ],
            [
              "想读中文理论书",
              "《大语言模型》赵鑫等（人大）",
              "体系最完整，引用规范，适合写\"依据\""
            ]
          ]
        },
        {
          "type": "heading",
          "level": 2,
          "text": "一个容易忽略的事实"
        },
        {
          "type": "paragraph",
          "text": "这些教程的差别不只是\"深浅\"，而是**抽象层次不同**：\n· d2l 从数学出发，先讲清梯度再写代码；\n· Happy-LLM 从工程出发，先给能跑的代码再解释；\n· Karpathy 从\"最小实现\"出发，把一切压到能一眼看完的规模；\n· CS336 从\"如果让你造一个工业级系统\"出发，直接上并行和性能。\n**同一个概念，在这四条路上的出场顺序完全不同。** 卡住的时候换一条路，往往比硬啃有效。"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "我们的读法",
          "text": "我们先读 Happy-LLM 搭骨架，卡在注意力时去看 Karpathy 的视频，写训练循环时对照 nanoGPT 的 train.py，数学推导回去查 d2l。\n**四份资料交叉用，比死磕一份快得多**——因为没有哪一份在\"讲清楚\"和\"能跑通\"上同时做到最好。"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "n-arch",
            "e-community",
            "e-models"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 4,
          "items": [
            {
              "label": "Datawhale, Happy-LLM",
              "url": "https://github.com/datawhalechina/happy-llm",
              "id": "r1"
            },
            {
              "label": "Zhang 等, Dive into Deep Learning（d2l，含中文版）",
              "url": "https://zh.d2l.ai/",
              "id": "r2"
            },
            {
              "label": "Stanford CS336: Language Modeling from Scratch（2025 春季）",
              "url": "https://stanford-cs336.github.io/spring2025/",
              "id": "r3"
            },
            {
              "label": "赵鑫等,《大语言模型》（在线版）",
              "url": "https://llmbook-zh.github.io/",
              "id": "r4"
            }
          ]
        },
        {
          "type": "files",
          "title": "都在这里",
          "items": [
            {
              "name": "Happy-LLM（中文，从零构建大模型）",
              "url": "https://github.com/datawhalechina/happy-llm"
            },
            {
              "name": "Self-LLM（中文，开源模型使用与微调指南）",
              "url": "https://github.com/datawhalechina/self-llm"
            },
            {
              "name": "LLM Cookbook（中文，吴恩达课程笔记）",
              "url": "https://github.com/datawhalechina/llm-cookbook"
            },
            {
              "name": "MiniMind（26M，全流程可跑）",
              "url": "https://github.com/jingyaogong/minimind"
            },
            {
              "name": "Karpathy · Zero to Hero 系列",
              "url": "https://karpathy.ai/zero-to-hero.html"
            },
            {
              "name": "CS224N（斯坦福 NLP 课程）",
              "url": "https://web.stanford.edu/class/cs224n/"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "还没弄清",
          "text": "- CS336 的作业量很大（实现完整训练栈），我们没有完整做完，只跟了前几讲。\n- 各教程的代码依赖版本差异较大，直接复制容易报错，要以仓库的 requirements 为准。"
        }
      ]
    },
    {
      "id": "e-models",
      "kind": "page",
      "icon": "🧠",
      "label": "开源模型与权重",
      "title": "开源模型：站在别人训好的肩膀上",
      "description": "LLaMA、Qwen、DeepSeek、Mistral、MiniCPM。选模型看四件事：许可、规模、词表、中文能力。",
      "heroAlign": "",
      "parent": "ecology",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "绝大多数\"做一个 AI 应用\"的需求，不需要从零训练——**拿一个开源权重做微调，效果好一百倍，成本低一千倍。**"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话",
          "text": "选开源模型先看四件事：**许可证能不能商用、规模装不装得下、词表中文效率高不高、这个尺寸的中文能力够不够。** 参数量排名是最后才看的。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "几个必须知道的家族"
        },
        {
          "type": "table",
          "title": "不是排名，是定位",
          "headers": [
            "家族",
            "代表规模",
            "特点",
            "许可"
          ],
          "rows": [
            [
              "LLaMA（Meta）",
              "1B—70B+",
              "开源大模型的事实基线，生态最全",
              "社区许可，商用有条件"
            ],
            [
              "Qwen（阿里）",
              "0.5B—72B+",
              "中文能力强，词表对中文友好，尺寸齐全",
              "多数 Apache 2.0"
            ],
            [
              "DeepSeek",
              "MoE 大模型 + 蒸馏小模型",
              "MoE 架构，推理成本低，技术报告详细",
              "MIT（部分版本）"
            ],
            [
              "Mistral",
              "7B 级为主",
              "小尺寸效率高，欧洲阵营",
              "Apache 2.0（部分）"
            ],
            [
              "MiniCPM（面壁）",
              "2B 级",
              "端侧小模型，中文表现超预期",
              "开源许可"
            ],
            [
              "MiniMind",
              "26M",
              "教学用，全流程可自己训",
              "开源"
            ]
          ]
        },
        {
          "type": "paragraph",
          "text": "**为什么词表要单独看：** 一个中文能力很强的模型，如果词表是英文-centric 的，处理中文仍然会多花两三倍 token。Qwen 系列专门扩了中文词表，这是它在中文任务上效率高的重要原因之一。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "选模型的实际顺序"
        },
        {
          "type": "paragraph",
          "text": "1. **先定显存上限**（见[定规模](#/p/n-scale)）：24GB 卡能舒服跑 7B 的 int4，或者 3B 的 fp16。\n2. **再看许可**：能不能商用、要不要署名、改过的模型能不能再分发。\n3. **再看中文**：拿自己的真实问题测 20 条，别只看榜单。\n4. **最后看生态**：有没有现成的微调脚本、量化版本、部署支持。"
        },
        {
          "type": "chart",
          "chartType": "bar",
          "title": "同一份中文文本在不同模型词表下的 token 数（示例，小样本实测）",
          "labels": [
            "英文-centric 词表",
            "中文优化词表"
          ],
          "data": [
            31,
            12
          ],
          "unit": "token"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "一个常见的误判",
          "text": "\"7B 一定比 3B 强\"——在同代同家族里基本成立，**跨家族、跨代际就不成立**。一个新一代的 3B 常常打得过上一代的 7B，因为数据质量和训练方法进步很快。\n所以比较时一定要看\"发布日期 + 数据配方\"，而不是只看参数。"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "e-posttrain",
            "e-infer",
            "n-sft"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 3,
          "items": [
            {
              "label": "Touvron 等, LLaMA 2: Open Foundation and Fine-Tuned Chat Models（2023，arXiv:2307.09288）",
              "url": "https://arxiv.org/abs/2307.09288",
              "id": "r1"
            },
            {
              "label": "DeepSeek-AI, DeepSeek-V3 Technical Report（2024，arXiv:2412.19437）",
              "url": "https://arxiv.org/abs/2412.19437",
              "id": "r2"
            },
            {
              "label": "Qwen Team, Qwen2 Technical Report（2024，arXiv:2407.10671）",
              "url": "https://arxiv.org/abs/2407.10671",
              "id": "r3"
            }
          ]
        },
        {
          "type": "files",
          "title": "下载与试用",
          "items": [
            {
              "name": "Hugging Face Models（全球最大的权重库）",
              "url": "https://huggingface.co/models"
            },
            {
              "name": "ModelScope 模型库（国内可直连）",
              "url": "https://modelscope.cn/models"
            },
            {
              "name": "Ollama 模型库（一条命令本地跑）",
              "url": "https://ollama.com/library"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "待核实",
          "text": "- 各模型的许可证条款在持续变化，商用前必须看原始 LICENSE，不能只看二手总结。\n- 榜单分数和实际体验的差距，在中文长文本任务上尤其明显，我们只测了短问答。"
        }
      ]
    },
    {
      "id": "e-train-fw",
      "kind": "page",
      "icon": "⚙️",
      "label": "训练框架与并行",
      "title": "训练框架：单卡跑不动之后怎么办",
      "description": "数据并行、张量并行、流水并行、ZeRO。四种切法切的是不同的东西，选错会白买卡。",
      "heroAlign": "",
      "parent": "ecology",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "单卡装不下时，第一反应是\"多买几张卡\"。但**多卡不是简单地把卡插上去就行**，你得决定切什么。"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话",
          "text": "三种并行切的是三个不同的维度：**数据并行切样本、张量并行切一层内的矩阵、流水并行切层。** 显存不够先上 ZeRO（切优化器状态），还不够再切张量。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "四种切法，切的东西不一样"
        },
        {
          "type": "table",
          "title": "选错会浪费卡",
          "headers": [
            "方式",
            "切什么",
            "解决什么",
            "代价"
          ],
          "rows": [
            [
              "数据并行 DP",
              "把 batch 分给各卡",
              "吞吐量",
              "每卡都要存完整模型"
            ],
            [
              "ZeRO / FSDP",
              "把参数、梯度、优化器状态分片",
              "单卡显存不够",
              "通信量上升"
            ],
            [
              "张量并行 TP",
              "把一层的矩阵按列/行切开",
              "单层太大装不下",
              "卡间通信极频繁，要求高带宽"
            ],
            [
              "流水并行 PP",
              "把层按段分给不同卡",
              "层数太多",
              "有气泡空闲，需要调 micro-batch"
            ],
            [
              "序列并行 / 上下文并行",
              "把长序列切开",
              "超长上下文",
              "注意力计算需要跨卡通信"
            ]
          ]
        },
        {
          "type": "paragraph",
          "text": "**经验顺序**：显存不够 → 先 ZeRO-2/3 或 FSDP；还不够 → 加张量并行（同一台机器内）；再不够 → 加流水并行（跨机器）。因为张量并行的通信最密集，必须放在带宽最高的连接上（NVLink），流水并行的通信最少，可以跨节点。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "三个框架的定位"
        },
        {
          "type": "paragraph",
          "text": "**Megatron-LM**（NVIDIA）：工业级大模型训练的参考实现，张量并行和流水并行的优化最成熟，代码复杂。\n**DeepSpeed**（微软）：ZeRO 三阶段的提出者，配置化程度高，中小团队用得多。\n**ColossalAI**（潞晨）：把多种并行策略封装成\"一键\"，对新手友好，适合快速试。\n**FSDP**（PyTorch 官方）：PyTorch 原生，和生态结合最紧，现在很多项目直接用它。"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "一个真实的成本账",
          "text": "我们算过：把 26M 的配置放大到 7B，如果用 8 张 A100 跑，按公开的云租赁价格，**一轮预训练就是几万块量级**，还不算反复试错。\n这就是为什么\"先在小模型上把链路跑通\"不是省钱技巧，是**唯一可行的路径**——你在 26M 上犯的错，在 7B 上会以一百倍的代价重犯一遍。"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "n-train",
            "n-scale",
            "e-models"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 3,
          "items": [
            {
              "label": "Rajbhandari 等, ZeRO: Memory Optimizations Toward Training Trillion Parameter Models（2019，arXiv:1910.02054）",
              "url": "https://arxiv.org/abs/1910.02054",
              "id": "r1"
            },
            {
              "label": "Shoeybi 等, Megatron-LM: Training Multi-Billion Parameter Language Models Using Model Parallelism（2019，arXiv:1909.08053）",
              "url": "https://arxiv.org/abs/1909.08053",
              "id": "r2"
            },
            {
              "label": "Huang 等, GPipe: Efficient Training of Giant Neural Networks using Pipeline Parallelism（2018，arXiv:1811.06965）",
              "url": "https://arxiv.org/abs/1811.06965",
              "id": "r3"
            }
          ]
        },
        {
          "type": "files",
          "title": "框架",
          "items": [
            {
              "name": "DeepSpeed（ZeRO / 混合精度 / 断点续训）",
              "url": "https://github.com/microsoft/DeepSpeed"
            },
            {
              "name": "Megatron-LM（NVIDIA 官方，大模型训练参考实现）",
              "url": "https://github.com/NVIDIA/Megatron-LM"
            },
            {
              "name": "ColossalAI（多种并行一键封装）",
              "url": "https://github.com/hpcaitech/ColossalAI"
            },
            {
              "name": "PyTorch FSDP 文档",
              "url": "https://pytorch.org/docs/stable/fsdp.html"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "还没弄清",
          "text": "- 各种并行组合在具体硬件上的最优配置，需要实测，公开的\"最佳实践\"换机器就不成立。\n- 我们没有真的在多机上跑过流水并行，这部分只到\"能读懂配置\"的程度。"
        }
      ]
    },
    {
      "id": "e-data-tools",
      "kind": "page",
      "icon": "🧰",
      "label": "数据与清洗工具",
      "title": "数据工具：几 TB 语料怎么过一遍",
      "description": "datasets、Data-Juicer、text-dedup、fastText 分类器。清洗不是写脚本，是搭流水线。",
      "heroAlign": "",
      "parent": "ecology",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "手工写 Python 循环处理几 TB 文本，跑到一半内存就爆了。**这一层的工具解决的是\"规模\"问题，不是\"逻辑\"问题。**"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话",
          "text": "数据流水线的标准形态是：**流式读取 → 规则过滤 → 去重 → 质量打分 → 分词 → 写分片**。每一段都能并行，整体不需要把数据全读进内存。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "四个必需的工具位"
        },
        {
          "type": "table",
          "title": "别自己造轮子",
          "headers": [
            "位置",
            "工具",
            "解决什么"
          ],
          "rows": [
            [
              "读取与格式",
              "Hugging Face Datasets / WebDataset",
              "流式读 TB 级数据，支持分片和多进程"
            ],
            [
              "规则清洗",
              "Data-Juicer（阿里）",
              "上百个现成算子：语言识别、长度、符号比、敏感词"
            ],
            [
              "去重",
              "text-dedup / MinHash",
              "文档级、段落级近似去重，不用两两比对"
            ],
            [
              "质量打分",
              "fastText 分类器 / 小模型打分",
              "用高质量语料训分类器，给全量数据打质量分"
            ]
          ]
        },
        {
          "type": "paragraph",
          "text": "**为什么去重不能两两比：** N 篇文档两两比较是 O(N²)。100 万篇就要比 5000 亿次。MinHash 的做法是给每篇文档算一个\"指纹集合\"，只在指纹相同的候选里比较，把复杂度压到接近线性。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "一条能跑的最小流水线"
        },
        {
          "type": "paragraph",
          "text": "实际项目中，这条线通常用配置文件描述，而不是写代码：读 → 过滤（语言、长度、重复率、敏感词）→ 去重 → 打分 → 采样配比 → 输出。每一步都记录\"剩下多少条\"，**因为清洗的每一步都会大幅缩水，你需要知道是哪一步砍掉的**。"
        },
        {
          "type": "chart",
          "chartType": "bar",
          "title": "每一步的留存率（我们那批语料的实际值）",
          "labels": [
            "读取",
            "语言过滤",
            "规则过滤",
            "去重",
            "质量打分"
          ],
          "data": [
            100,
            92,
            71,
            54,
            29
          ],
          "unit": "%"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "一个容易忽略的点",
          "text": "清洗流水线必须**可复现**。同一批数据、同一份配置，跑两次结果要一样（去重要固定随机种子，多进程顺序要确定）。\n否则你没法回答\"为什么这次效果变差了\"——你连数据是不是同一份都不知道。"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "n-data",
            "n-clean",
            "e-tokenizer"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 2,
          "items": [
            {
              "label": "Data-Juicer: A One-Stop Data Processing System for Large Language Models（2023，arXiv:2309.02033）",
              "url": "https://arxiv.org/abs/2309.02033",
              "id": "r1"
            },
            {
              "label": "Lee 等, Deduplicating Training Data Makes Language Models Better（2021，arXiv:2107.06499）",
              "url": "https://arxiv.org/abs/2107.06499",
              "id": "r2"
            }
          ]
        },
        {
          "type": "files",
          "title": "工具",
          "items": [
            {
              "name": "Data-Juicer（算子最全的中文友好流水线）",
              "url": "https://github.com/modelscope/data-juicer"
            },
            {
              "name": "Hugging Face Datasets（流式读取与处理）",
              "url": "https://github.com/huggingface/datasets"
            },
            {
              "name": "text-dedup（MinHash / SimHash 实现）",
              "url": "https://github.com/ChenghaoMou/text-dedup"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "待核实",
          "text": "- Data-Juicer 各算子的默认阈值是否适合中文，我们没有系统测；官方文档给的是通用建议。\n- 质量分类器的训练集来源会直接决定它的偏好，这一点常被忽略。"
        }
      ]
    },
    {
      "id": "e-tokenizer",
      "kind": "page",
      "icon": "🔤",
      "label": "分词工具",
      "title": "分词工具：三行代码训一个自己的词表",
      "description": "tiktoken、SentencePiece、HF Tokenizers。训练词表、编码、解码、算 token 数。",
      "heroAlign": "",
      "parent": "ecology",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "分词器是少数**可以完全自己训**的组件——语料在手，几十分钟就能得到一个专属词表。"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话",
          "text": "三个库各管一段：**SentencePiece** 训练词表（支持 BPE / Unigram），**HF Tokenizers** 做高速批量编码，**tiktoken** 用来对齐 OpenAI 的切分方式做对比。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "训一个自己的词表"
        },
        {
          "type": "table",
          "title": "三个库的分工",
          "headers": [
            "库",
            "强项",
            "常见用途"
          ],
          "rows": [
            [
              "SentencePiece",
              "直接从原始文本训，不依赖预分词；对中文友好",
              "从零训练自己的分词器"
            ],
            [
              "HF Tokenizers",
              "Rust 实现，批量编码极快；与 Transformers 无缝",
              "加载现成分词器、批量处理语料"
            ],
            [
              "tiktoken",
              "与 OpenAI 模型切分完全一致",
              "算 API 成本、对比 token 效率"
            ]
          ]
        },
        {
          "type": "paragraph",
          "text": "训练词表的关键参数只有三个：**词表大小**（32000 是常见起点）、**字符覆盖率**（保证不出现未知词，通常用 byte-level 兜底）、**特殊标记**（`<pad>`、`<eos>`、对话模板用的 role 标记）。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "一个立刻能做的检查"
        },
        {
          "type": "paragraph",
          "text": "分词器训完，先做一件事：**拿一段典型中文、一段代码、一段中英混排，分别看切成多少 token。** 如果中文被切成大量单字，说明词表对中文覆盖不足；如果代码里的空格被单独切成 token，说明预切分的正则不合适。\n这个检查只要五分钟，但能提前发现后面几周才会暴露的问题。"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "一个反直觉的结论",
          "text": "词表不是越大越好。**词表翻倍，嵌入层参数量也翻倍**——对小模型来说，这是很大的浪费。26M 的模型如果配 15 万词表，光嵌入层就占掉一半参数。\n所以小模型通常配 3 万—6 万词表，大模型才敢上 10 万以上。**词表大小要和模型规模一起考虑，不是独立选择。**"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "n-token",
            "e-data-tools",
            "n-scale"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 2,
          "items": [
            {
              "label": "Sennrich 等, Neural Machine Translation of Rare Words with Subword Units（BPE，2016，arXiv:1508.07909）",
              "url": "https://arxiv.org/abs/1508.07909",
              "id": "r1"
            },
            {
              "label": "Kudo & Richardson, SentencePiece: A simple and language independent subword tokenizer（2018，arXiv:1808.06226）",
              "url": "https://arxiv.org/abs/1808.06226",
              "id": "r2"
            }
          ]
        },
        {
          "type": "files",
          "title": "工具",
          "items": [
            {
              "name": "SentencePiece",
              "url": "https://github.com/google/sentencepiece"
            },
            {
              "name": "Hugging Face Tokenizers",
              "url": "https://github.com/huggingface/tokenizers"
            },
            {
              "name": "tiktoken",
              "url": "https://github.com/openai/tiktoken"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "还没弄清",
          "text": "- 中文词表的最优规模没有公认结论，公开模型从 3 万到 15 万都有，效果差异也缺少控制变量的对比。"
        }
      ]
    },
    {
      "id": "e-posttrain",
      "kind": "page",
      "icon": "🎛️",
      "label": "微调与对齐工具",
      "title": "后训练工具：不改代码做 SFT 和 DPO",
      "description": "LLaMA-Factory、ms-swift、TRL、Axolotl。配置驱动，图形界面，单卡可跑。",
      "heroAlign": "",
      "parent": "ecology",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "SFT 和 DPO 的代码其实不长，但**数据格式、模板、mask、显存优化这些琐事会吃掉八成时间**。这一层的工具就是把这些琐事封装掉。"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话",
          "text": "后训练工具的共同形态是：**你给一份数据 + 一个 YAML 配置，它负责拼模板、算 mask、选优化器、存 checkpoint。** 你只需要关心数据和超参。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "四个主流选择"
        },
        {
          "type": "table",
          "title": "按场景选",
          "headers": [
            "工具",
            "特点",
            "适合"
          ],
          "rows": [
            [
              "LLaMA-Factory",
              "图形界面 + 配置文件，支持上百种模型，中文文档好",
              "第一次做微调，想少写代码"
            ],
            [
              "ms-swift（ModelScope）",
              "阿里维护，中文模型支持最好，支持 DPO/KTO/ORPO",
              "用 Qwen 等国产模型"
            ],
            [
              "TRL（Hugging Face）",
              "代码库而非配置工具，SFT/PPO/DPO 参考实现",
              "想读懂算法本身"
            ],
            [
              "Axolotl",
              "配置驱动，多卡支持好，社区活跃",
              "需要多卡微调"
            ]
          ]
        },
        {
          "type": "heading",
          "level": 2,
          "text": "数据格式是最大的坑"
        },
        {
          "type": "paragraph",
          "text": "这些工具都要求数据是特定 JSON 结构（常见是 `{\"messages\": [...]}` 或 `{\"instruction\": ..., \"output\": ...}`）。**格式错了不会报错，只会训出奇怪的行为。**\n判断方法：训之前用工具自带的\"预览\"功能，看它拼出来的完整 prompt 长什么样。**你要确认的是：模板分隔符、角色标记、结束符，和你推理时用的完全一致。**"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "一个省下两周的发现",
          "text": "我们最初手写 SFT 代码，光\"补齐位置要不要算 loss\"这个问题就调了三天。换成工具后，配置里一个 `mask_prompt: true` 就解决了。\n这不是说不用懂原理——**不懂原理你连这个参数该不该开都判断不了**。但懂原理之后，没必要自己重写一遍。"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "n-sft",
            "n-align",
            "e-models"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 2,
          "items": [
            {
              "label": "Hu 等, LoRA: Low-Rank Adaptation of Large Language Models（2021，arXiv:2106.09685）",
              "url": "https://arxiv.org/abs/2106.09685",
              "id": "r1"
            },
            {
              "label": "Rafailov 等, Direct Preference Optimization（DPO，2023，arXiv:2305.18290）",
              "url": "https://arxiv.org/abs/2305.18290",
              "id": "r2"
            }
          ]
        },
        {
          "type": "files",
          "title": "工具",
          "items": [
            {
              "name": "LLaMA-Factory（图形界面微调，中文友好）",
              "url": "https://github.com/hiyouga/LLaMA-Factory"
            },
            {
              "name": "ms-swift（ModelScope 微调框架）",
              "url": "https://github.com/modelscope/ms-swift"
            },
            {
              "name": "TRL（Hugging Face，SFT/DPO/PPO 参考实现）",
              "url": "https://github.com/huggingface/trl"
            },
            {
              "name": "Axolotl（配置驱动，多卡支持好）",
              "url": "https://github.com/axolotl-ai-cloud/axolotl"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "待核实",
          "text": "- 各工具的默认超参（学习率、warmup）针对 7B 级别调过，用在 26M 上偏大，需要自己降。\n- 不同工具对同一份数据的模板处理细节不同，跨工具迁移时要重新验证输出格式。"
        }
      ]
    },
    {
      "id": "e-infer",
      "kind": "page",
      "icon": "⚡",
      "label": "推理与服务",
      "title": "推理服务：从脚本到\"别人能用\"",
      "description": "vLLM、SGLang、llama.cpp、Ollama。批处理、KV Cache 管理、量化格式，决定了并发能力。",
      "heroAlign": "",
      "parent": "ecology",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "训练脚本是\"一次生成一段\"，服务引擎是\"同时服务一百个人\"。**这两件事的工程要求完全不同。**"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话",
          "text": "服务引擎要解决三件事：**把多个请求拼成一批**（continuous batching）、**高效管理 KV Cache**（PagedAttention）、**把模型压小**（量化）。三者叠加，吞吐能差十倍以上。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "四个引擎的定位"
        },
        {
          "type": "table",
          "title": "不是替代关系，是场景不同",
          "headers": [
            "引擎",
            "跑在哪",
            "适合"
          ],
          "rows": [
            [
              "vLLM",
              "GPU 服务器",
              "在线服务，高并发，PagedAttention 的提出者"
            ],
            [
              "SGLang",
              "GPU 服务器",
              "复杂提示、结构化输出、多轮复用"
            ],
            [
              "llama.cpp",
              "CPU / 混合 / 端侧",
              "没有 GPU 也能跑，GGUF 量化格式"
            ],
            [
              "Ollama",
              "本机",
              "一条命令跑起来，演示和本地开发首选"
            ],
            [
              "TensorRT-LLM",
              "NVIDIA GPU",
              "极致性能，编译优化，部署成本高"
            ]
          ]
        },
        {
          "type": "paragraph",
          "text": "**为什么\"能跑\"和\"能用\"差这么远：** 一个朴素脚本收到请求就生成，第二个人来了只能排队。加了 continuous batching 之后，正在生成的请求和新请求可以拼进同一批，GPU 利用率从 10% 提到 60% 以上。**模型没变，吞吐变了六倍。**"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "量化的实际影响"
        },
        {
          "type": "paragraph",
          "text": "fp16 → int8：显存减半，速度接近翻倍，质量损失通常很小。\nint8 → int4：显存再减半，速度再提升，**但质量开始可见下降**，尤其在长链推理和代码任务上。\n所以\"int4 能用吗\"这个问题没有统一答案，取决于你的任务能容忍多少退化——**必须自己测，别信\"几乎无损\"这种说法。**"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "我们的教训",
          "text": "第一版部署，我们把模型加载写在了请求处理函数里——**每个请求都重新加载一遍模型**。测试时一个人用没问题，两个人同时打开就双双卡死。\n正确做法是进程启动时加载一次、常驻显存，请求只做前向。这是\"脚本\"和\"服务\"最本质的区别。"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "n-deploy",
            "e-models",
            "n-eval"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 3,
          "items": [
            {
              "label": "Kwon 等, PagedAttention / vLLM（2023，arXiv:2309.06180）",
              "url": "https://arxiv.org/abs/2309.06180",
              "id": "r1"
            },
            {
              "label": "Dao 等, FlashAttention（2022，arXiv:2205.14135）",
              "url": "https://arxiv.org/abs/2205.14135",
              "id": "r2"
            },
            {
              "label": "Frantar 等, GPTQ（2022，arXiv:2210.17323）",
              "url": "https://arxiv.org/abs/2210.17323",
              "id": "r3"
            }
          ]
        },
        {
          "type": "files",
          "title": "部署",
          "items": [
            {
              "name": "vLLM（高并发在线服务）",
              "url": "https://github.com/vllm-project/vllm"
            },
            {
              "name": "SGLang（结构化输出、前缀复用）",
              "url": "https://github.com/sgl-project/sglang"
            },
            {
              "name": "llama.cpp（CPU / 端侧，GGUF）",
              "url": "https://github.com/ggerganov/llama.cpp"
            },
            {
              "name": "Ollama（本地一键运行）",
              "url": "https://github.com/ollama/ollama"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "还没弄清",
          "text": "- 各引擎在中文长文本上的实际吞吐，我们只做了单机单请求测试，没有压测数据。\n- 量化对\"指令遵循\"的影响比对\"困惑度\"的影响大得多，这一点我们只观察到现象，没有量化结论。"
        }
      ]
    },
    {
      "id": "e-eval",
      "kind": "page",
      "icon": "📊",
      "label": "评测体系",
      "title": "评测体系：榜单、框架与它们的水分",
      "description": "OpenCompass、lm-evaluation-harness、C-Eval、MMLU。怎么跑、怎么看、哪些分数不能比。",
      "heroAlign": "",
      "parent": "ecology",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "评测已经形成了自己的生态：**基准数据集、评测框架、公开榜单**三层。会用的人能拿到可信结论，不会用的人只会看排名。"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话",
          "text": "评测框架解决\"怎么跑得一致\"，榜单解决\"和别人比\"，但**两者都不能替你判断\"这个模型对我的任务有没有用\"**。后者只能自己出题。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "三层结构"
        },
        {
          "type": "table",
          "title": "各管一段",
          "headers": [
            "层",
            "代表",
            "作用"
          ],
          "rows": [
            [
              "数据集",
              "MMLU、GSM8K、HumanEval、C-Eval",
              "定义\"考什么\""
            ],
            [
              "框架",
              "lm-evaluation-harness、OpenCompass",
              "保证 prompt、shot 数、解码参数一致"
            ],
            [
              "榜单",
              "Papers with Code、C-Eval 榜、各家技术报告",
              "横向比较，但要注意提交条件"
            ]
          ]
        },
        {
          "type": "paragraph",
          "text": "**框架的价值在于\"同条件\"**：同一套 prompt 模板、同样的 few-shot 示例、同样的解码参数。自己写评测脚本最容易出的问题就是——两个模型用了不同的模板，分数差 10 分，你以为是模型差异。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "三种不能直接比的分数"
        },
        {
          "type": "paragraph",
          "text": "**一、shot 数不同。** 0-shot 和 5-shot 不是同一个任务。\n**二、解码方式不同。** greedy 和采样、有没有 CoT 提示，都能差出十几分。\n**三、版本不同。** 同一个榜单每年会修题、去污染，2023 年的 80 分和 2025 年的 80 分不是一回事。\n所以看到\"某模型超过 GPT-4\"这种标题，先找它的评测配置，八成能找到不对等的地方。"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "我们最后的做法",
          "text": "放弃追总分，改成**自己出 50 道题 + 分维度打分 + 双人独立评**。\n题全部自己写（避免污染），维度分成语法、事实、指令遵循、有用性四项，两人分别评再对差异。\n这套东西不\"学术\"，但它能回答我们真正关心的问题：**这个模型能不能用来干这件事。**"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "n-eval",
            "n-clean",
            "e-papers"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 3,
          "items": [
            {
              "label": "Hendrycks 等, MMLU（2020，arXiv:2009.03300）",
              "url": "https://arxiv.org/abs/2009.03300",
              "id": "r1"
            },
            {
              "label": "Huang 等, C-Eval（2023，arXiv:2305.08322）",
              "url": "https://arxiv.org/abs/2305.08322",
              "id": "r2"
            },
            {
              "label": "Liang 等, Holistic Evaluation of Language Models（HELM，2022，arXiv:2211.09110）",
              "url": "https://arxiv.org/abs/2211.09110",
              "id": "r3"
            }
          ]
        },
        {
          "type": "files",
          "title": "工具与榜单",
          "items": [
            {
              "name": "OpenCompass（中文评测体系）",
              "url": "https://github.com/open-compass/opencompass"
            },
            {
              "name": "lm-evaluation-harness（学术常用）",
              "url": "https://github.com/EleutherAI/lm-evaluation-harness"
            },
            {
              "name": "C-Eval 官网",
              "url": "https://cevalbenchmark.com/"
            },
            {
              "name": "HELM（斯坦福，多维度评测）",
              "url": "https://crfm.stanford.edu/helm/"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "待核实",
          "text": "- 各榜单的污染情况无法完全排除，即使做了 n-gram 检测也可能漏掉改写过的题。\n- \"LLM 当裁判\"与人类评分的一致性数字，不同论文差异很大，我们没有独立复现。"
        }
      ]
    },
    {
      "id": "e-papers",
      "kind": "page",
      "icon": "📄",
      "label": "论文与会议",
      "title": "论文与会议：读哪几篇就够入门",
      "description": "七篇必读、四个会议、一个查法。不是读得多，是读对顺序。",
      "heroAlign": "",
      "parent": "ecology",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "这个领域每年上万篇论文，但**撑起整条链路的核心论文不到十篇**。先把这十篇读透，比刷 arXiv 列表有用得多。"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话",
          "text": "读论文的顺序应该跟着链路走：**结构 → 目标 → 规模 → 微调 → 对齐 → 评测 → 推理**。乱序读会觉得每篇都在讲新东西，其实它们在同一根线上。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "七篇核心"
        },
        {
          "type": "table",
          "title": "按链路顺序，不按年份",
          "headers": [
            "论文",
            "在解决什么",
            "读它要知道什么"
          ],
          "rows": [
            [
              "Attention Is All You Need (2017)",
              "提出 Transformer，去掉循环",
              "自注意力、多头、位置编码"
            ],
            [
              "GPT-3 (2020)",
              "证明\"规模 + 上下文学习\"可行",
              "few-shot、in-context learning"
            ],
            [
              "Scaling Laws (2020)",
              "损失随规模幂律下降",
              "幂律、计算预算"
            ],
            [
              "Chinchilla (2022)",
              "修正配比：参数与数据 1:20",
              "计算最优、数据不足"
            ],
            [
              "InstructGPT (2022)",
              "RLHF 三步流程成型",
              "SFT、奖励模型、PPO"
            ],
            [
              "DPO (2023)",
              "跳过奖励模型直接优化偏好",
              "隐式奖励、Bradley-Terry"
            ],
            [
              "vLLM / PagedAttention (2023)",
              "把 KV Cache 像内存页一样管理",
              "分页、吞吐、显存碎片"
            ]
          ]
        },
        {
          "type": "paragraph",
          "text": "**如果只读三篇**：Attention Is All You Need（知道结构）、Chinchilla（知道规模怎么配）、InstructGPT（知道怎么让它听话）。这三篇覆盖了 80% 的\"为什么这样设计\"。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "四个会议与一个习惯"
        },
        {
          "type": "paragraph",
          "text": "**NeurIPS / ICML / ICLR** 是机器学习三大顶会，方法类论文集中在这里；**ACL / EMNLP** 偏自然语言处理，评测和语言学分析多。\n大模型时代的现实是：**最重要的进展常常先出现在技术报告（arXiv + 官方博客），而不是会议论文。** 所以养成一个习惯——看到新模型，先去找它的技术报告，那里有完整的训练配置、数据配比和消融实验，比论文正文有用。"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "读论文的一个方法",
          "text": "我们的做法是**只读四段**：摘要（它声称解决了什么）、方法图（结构长什么样）、实验设置表（用了多少数据、什么硬件）、局限性（作者自己承认没做到的）。\n正文的数学推导先跳过——**第一遍读不懂公式是正常的，先建立\"它在整条链路的哪个位置\"的印象，第二遍再抠细节。**"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "e-open-course",
            "n-arch",
            "n-align"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 3,
          "items": [
            {
              "label": "Vaswani 等, Attention Is All You Need（2017，arXiv:1706.03762）",
              "url": "https://arxiv.org/abs/1706.03762",
              "id": "r1"
            },
            {
              "label": "Kaplan 等, Scaling Laws for Neural Language Models（2020，arXiv:2001.08361）",
              "url": "https://arxiv.org/abs/2001.08361",
              "id": "r2"
            },
            {
              "label": "Ouyang 等, InstructGPT（2022，arXiv:2203.02155）",
              "url": "https://arxiv.org/abs/2203.02155",
              "id": "r3"
            }
          ]
        },
        {
          "type": "files",
          "title": "去哪里找",
          "items": [
            {
              "name": "arXiv · cs.CL（计算语言学最新预印本）",
              "url": "https://arxiv.org/list/cs.CL/recent"
            },
            {
              "name": "Papers with Code（论文 + 代码 + 榜单）",
              "url": "https://paperswithcode.com/"
            },
            {
              "name": "ACL Anthology（NLP 论文全文库）",
              "url": "https://aclanthology.org/"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "还没弄清",
          "text": "- 会议论文和技术报告的质量差异很大，预印本没有同行评审，引用前要自己判断。\n- 我们读的论文集中在 2017—2024，2025 年之后的进展（如新的 RL 训练范式）尚未系统跟进。"
        }
      ]
    },
    {
      "id": "e-community",
      "kind": "page",
      "icon": "💬",
      "label": "社区与信息源",
      "title": "社区：中文资料去哪找",
      "description": "知乎、科学空间、B 站、公众号、GitHub Issue。按\"要解决什么问题\"选入口。",
      "heroAlign": "",
      "parent": "ecology",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "英文资料最全，但中文社区有三样东西是英文没有的：**中文语料的实践经验、国产模型的细节、以及\"踩过同一个坑\"的记录。**"
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话",
          "text": "找概念去知乎和科学空间，看实现去 GitHub 和 B 站，追进展去公众号和 X，**卡住了去 Issue 区搜报错原文**——最后这条最有效，也最少人用。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "四个入口，四种用途"
        },
        {
          "type": "table",
          "title": "别用同一个入口解决所有问题",
          "headers": [
            "入口",
            "强项",
            "怎么用"
          ],
          "rows": [
            [
              "知乎",
              "概念解释、经验总结、论文解读",
              "搜具体术语 + \"详解\"；看高赞但注意时效"
            ],
            [
              "科学空间（kexue.fm）",
              "苏剑林的数学推导，RoPE 等的中文原始解释",
              "搜模型结构、损失设计的推导"
            ],
            [
              "B 站",
              "视频课程、代码实操",
              "李沐的论文精读、3Blue1Brown 的数学直觉"
            ],
            [
              "GitHub Issue",
              "真实报错、版本兼容、别人的解决方案",
              "**直接把报错信息粘进去搜**"
            ],
            [
              "机器之心 / 量子位",
              "行业动态、模型发布",
              "追进展，但技术细节要看原文"
            ]
          ]
        },
        {
          "type": "paragraph",
          "text": "**Issue 区是被严重低估的资料。** 你遇到的 `loss nan`、`CUDA out of memory`、`tokenizer 报错`，几乎一定有人遇到过，而且解决方案就在评论里。比问任何人都快。"
        },
        {
          "type": "heading",
          "level": 2,
          "text": "中文资料的两个坑"
        },
        {
          "type": "paragraph",
          "text": "**一、时效性。** 2023 年之前的很多\"大模型教程\"讲的是 BERT 时代的范式，套到现在的 GPT 架构上会误导。看文章先看日期。\n**二、二手转述的错误。** 同一个概念经过三次转述，细节会走形。比如\"温度越高越随机\"是对的，但\"温度=0 就是 greedy\"在实现上不一定（有些实现是 temperature=0 会除零）。**关键结论回原始论文或官方文档核对。**"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "我们的信息来源配比",
          "text": "实际用下来大概是：**官方文档和论文 50%、GitHub Issue 25%、中文博客和知乎 15%、视频 10%。**\n比例不是重点，重点是——**遇到具体报错，第一站永远是 Issue 区，不是搜索引擎首页。**"
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "e-open-course",
            "e-papers"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 2,
          "items": [
            {
              "label": "科学空间（苏剑林的技术博客，RoPE 等的中文原始推导）",
              "url": "https://kexue.fm/",
              "id": "r1"
            },
            {
              "label": "Hugging Face 中文文档与论坛",
              "url": "https://huggingface.co/learn/llm-course/zh-CN/chapter1/1",
              "id": "r2"
            }
          ]
        },
        {
          "type": "files",
          "title": "收藏这几个",
          "items": [
            {
              "name": "科学空间 kexue.fm",
              "url": "https://kexue.fm/"
            },
            {
              "name": "李沐 · 论文精读（B 站）",
              "url": "https://space.bilibili.com/1567748478"
            },
            {
              "name": "3Blue1Brown 官方 B 站（数学直觉）",
              "url": "https://space.bilibili.com/88461692"
            },
            {
              "name": "Hugging Face 中文课程",
              "url": "https://huggingface.co/learn/llm-course/zh-CN/chapter1/1"
            }
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "提醒",
          "text": "- 中文社区的\"某某模型吊打 GPT-4\"类内容，多数缺少可复现的评测配置，不建议作为技术判断依据。\n- 知乎回答的时效性差异极大，同一个问题下 2022 年和 2025 年的答案可能互相矛盾。"
        }
      ]
    },
    {
      "id": "c-causal",
      "kind": "page",
      "icon": "🔗",
      "label": "因果链",
      "title": "从问题到判断：信息如何影响回答",
      "description": "每一步都在补上一步留下的具体缺陷。理解了\"洞\"和\"补丁\"，才算理解这条链路。",
      "heroAlign": "",
      "parent": "cognition",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "这一页不把大模型训练当成一张可以随意挑选的清单，而是从“问题怎样变成判断”往回看信息链。每个环节都有它要完成的事，也可能留下下一个环节要处理的缺口。",
          "_ts": 1794219423576
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话",
          "text": "回答受已有知识、输入资料、推理和外部工具共同影响。答对了，不足以证明它刚刚搜索过。",
          "_ts": 1794222125131
        },
        {
          "type": "heading",
          "level": 2,
          "text": "从判断往回推",
          "_ts": 1794222140355
        },
        {
          "type": "paragraph",
          "text": "要确认“模型训练花了多少钱”，先要说清成本口径，再取得相应资料，检查数字与排除项，最后作出判断。\n\n提出问题→取得信息→核对依据→形成判断→发现缺口，各环节不能相互代替。\n\n已有知识、材料内推理和外部搜索可以共同参与回答，不是互斥类别。模型自述也不是对内部过程或工具行为的完整证明。",
          "_ts": 1794222144445
        },
        {
          "type": "table",
          "title": "每个缺口与处理方式",
          "headers": [
            "当前缺口",
            "可采取的行动",
            "不能直接推断什么"
          ],
          "rows": [
            [
              "输入没有某项费用",
              "找到记录，或保留未知",
              "不能当成费用为零"
            ],
            [
              "有链接但没读到正文",
              "如实记录获取失败，暂不当依据",
              "不能认为标题就是已核实结论"
            ],
            [
              "数字没有明确统计范围",
              "核对包含项、排除项和假设",
              "不能当作全部成本"
            ],
            [
              "单次结果都是正确",
              "检查题型、熟悉度与样本限制",
              "不能断言资料永远没用"
            ]
          ]
        },
        {
          "type": "heading",
          "level": 2,
          "text": "一个反例：没有共同标准会怎样",
          "_ts": 1794222182530
        },
        {
          "type": "paragraph",
          "text": "第一轮测试中，AI助手先写下相同的6道题和0—2分的核对标准，再分别运行不附原文与附原文的两个独立会话，首次回答全部保留。\n\n如果没有共同题目和标准，就很容易只凭“看起来更流畅”判断哪组更好，也很难说明差异是否来自资料。即使这样设计，本轮两组仍均为12/12，说明预先定标准能避免乱下结论，却不能自动制造差异。",
          "_ts": 1794222186197
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "这条链路的真实形状",
          "text": "问题→取得信息→核对依据→形成判断→发现缺口→再查证，是一个可以回访的过程。\n\n发现缺口后，可以返回前面的环节补资料或改问题，不是固定十二步必须反复从头训练。本次没有验证“所有模型项目都不能跳过某一步”的命题。",
          "_ts": 1794222190887
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "c-tradeoff",
            "c-method",
            "n-eval"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 2,
          "items": [
            {
              "label": "DeepSeek-AI：《DeepSeek-V3技术报告》v1（2024-12-27）",
              "url": "https://arxiv.org/html/2412.19437v1#S1"
            },
            {
              "label": "《人工智能前沿与创新》课程大作业要求：认知地图与资料规范",
              "url": "https://ai-course-assignment.app.workbuddy.host/#assignment"
            }
          ]
        },
        {
          "type": "files",
          "title": "继续查证",
          "items": [
            {
              "name": "四问模板：两轮比较的完整记录",
              "url": "https://fvymyhy98d-netizen.github.io/living-maps2/#/p/c-method"
            },
            {
              "name": "能力边界：本人参与、AI辅助与未开展的工作",
              "url": "https://fvymyhy98d-netizen.github.io/living-maps2/#/p/c-boundary"
            }
          ],
          "_ts": 1794222234789
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "还没弄清",
          "text": "在不明确要求查证、但允许使用工具的条件下，模型何时会主动搜索，本次没有测试。\n\n公开报告中的信息可能本来就在模型已有知识中；因此这次两组同分，不能说明参考资料永远没有作用。\n\n以上都是本轮尚未弄清的问题，下一步应另设比较或查证，而不是把猜测写成结论。",
          "_ts": 1794222245605
        }
      ],
      "heroStyle": {}
    },
    {
      "id": "c-revise",
      "kind": "page",
      "icon": "🔄",
      "label": "三次认知修正",
      "title": "我的判断怎样推进：不强行凑三次反转",
      "description": "参数越大越好 → 配比才是关键；清洗是杂活 → 清洗是核心；loss 低就好 → loss 只是信号。",
      "heroAlign": "",
      "parent": "cognition",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "我记录的是一段真实的判断推进过程，不要求每次都证明“我原来错了”。原来的预期可以保留，但要同时说清：这次证据够不够，下一步准备怎样验证。",
          "_ts": 1794218578354
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话",
          "text": "记录实际判断过程，不要求每次都证明“我原来错了”。保留原预期，也要说清当前证据够不够。",
          "_ts": 1794218561629
        },
        {
          "type": "heading",
          "level": 2,
          "text": "起点：我原来怎样想",
          "_ts": 1794218815953
        },
        {
          "type": "paragraph",
          "text": "**我预期给模型参考资料会更准确；资料没有答案时，它会自己去找。当时没有区分利用已有知识、推理和联网搜索。第一轮之后，我暂时不调整原来的预期。**",
          "_ts": 1794218604164
        },
        {
          "type": "heading",
          "level": 2,
          "text": "首轮结果：我提出样本不足",
          "_ts": 1794218818596
        },
        {
          "type": "paragraph",
          "text": "**两组都答出了6题的关键要点，AI初核均12/12。我写下：“可以发现，本次两组都答对了，于是我就觉得测试样本量不足，还需要进一步测试。”**\n**\n**\n**这一判断没有宣称资料一定有效或无效，而是指出本轮证据不足。AI助手补充了题目熟悉度的限制；随后我选择“简略资料 vs 完整资料”作为第二轮条件。**",
          "_ts": 1794218613802
        },
        {
          "type": "heading",
          "level": 2,
          "text": "第二轮：我怎样评价未知",
          "_ts": 1794218820837
        },
        {
          "type": "paragraph",
          "text": "**完整资料组知道额外80美元的数据整理费，能算出400美元；简略资料组没有这个金额，拒绝编造合计。我认为不应把它判错：“不应该，我觉得面对未知，偏保守也是合理的，不过我通常偏激进，会直接估价。”**\n**\n**\n**我也曾粗略猜测DeepSeek-V3全部研发可能约1500万美元。这个数字没有费用分项或来源支撑，作为个人猜测保留，不列为已核实成本。**",
          "_ts": 1794218622691
        },
        {
          "type": "chart",
          "chartType": "bar",
          "title": "第一轮六题初步核对得分（满分12分）",
          "labels": [
            "不附原文",
            "附原文"
          ],
          "data": [
            12,
            12
          ],
          "unit": "分"
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "这段过程实际改变了什么",
          "text": "这不是三次观点反转，也不能说我已掌握模型机理。具体推进在于：我开始评价这次证据是否充分，并参与决定怎样继续比较。\n\n原来的预期仍然保留；新增的是对样本限制和“缺少信息时怎样回答”的具体判断。没有为了作业强行编造一次认识反转。",
          "_ts": 1794218739999
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "c-misconception",
            "c-method",
            "c-boundary"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 3,
          "items": [
            {
              "label": "DeepSeek-AI：《DeepSeek-V3技术报告》v1（2024-12-27）",
              "url": "https://arxiv.org/html/2412.19437v1#S1"
            },
            {
              "label": "《人工智能前沿与创新》课程大作业要求：认知地图与资料规范",
              "url": "https://ai-course-assignment.app.workbuddy.host/#assignment"
            }
          ]
        },
        {
          "type": "files",
          "title": "查看方法与边界",
          "items": [
            {
              "name": "四问模板：两轮比较的完整记录",
              "url": "https://fvymyhy98d-netizen.github.io/living-maps2/#/p/c-method"
            },
            {
              "name": "能力边界：本人参与、AI辅助与未开展的工作",
              "url": "https://fvymyhy98d-netizen.github.io/living-maps2/#/p/c-boundary"
            }
          ],
          "_ts": 1794218770618
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "诚实说明",
          "text": "本页记录的是我实际参与的部分：提出初始判断、指出样本不足、选择第二轮条件、评价合理未知。\n\n两轮测试由AI助手执行并初核；我参与关键结果评价，没有独立复核全部题目。1500万美元只是个人粗略猜测，没有分项或来源支持，不列为实际研发成本。\n\n网站原有“清洗数据”“训练26M模型”等经历，若没有组员提供的真实记录，不应作为本次认知页的实践证据。",
          "_ts": 1794218788410
        }
      ],
      "heroStyle": {}
    },
    {
      "id": "c-misconception",
      "kind": "page",
      "icon": "🚫",
      "label": "常见误解",
      "title": "六条需要补充条件的判断",
      "description": "每一条都配了\"错在哪\"和\"正确的说法\"。这些是查资料时最容易被打包带走的错误。",
      "heroAlign": "",
      "parent": "cognition",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "这一页检查六个容易从本次测试中被过度概括的说法。每一条都给出更准确的表述和本次依据；它们不是整个领域的定论，也不靠“听起来合理”来成立。",
          "_ts": 1794219169814
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话",
          "text": "先检查来源和适用范围，再决定一句话能说到哪里。",
          "_ts": 1794219176997
        },
        {
          "type": "table",
          "title": "六条，逐条核对",
          "headers": [
            "待检查的说法",
            "更准确的表述",
            "本次依据"
          ],
          "rows": [
            [
              "模型答对就是查过",
              "正确性不能证明实际工具调用",
              "首轮记录与工具自报限制"
            ],
            [
              "两组同分说明资料没用",
              "只说明本轮未观察到正确性差异",
              "首轮每条件一次，题目可能已熟悉"
            ],
            [
              "没给具体金额就是答错",
              "信息不足时保留未知可以合理",
              "第二轮Q2及本人评价"
            ],
            [
              "已记录费用等于全部成本",
              "还要核对未记录项目",
              "第二轮未知人工费"
            ],
            [
              "557.6万美元是全部研发费用",
              "是特定口径的正式训练估算",
              "DeepSeek-V3报告第1节"
            ],
            [
              "160 GPU小时就是运行160小时",
              "累计设备工时不足以确定墙钟时长",
              "第二轮Q4与并行配置缺失"
            ]
          ]
        },
        {
          "type": "heading",
          "level": 2,
          "text": "为什么容易混淆",
          "_ts": 1794219214084
        },
        {
          "type": "paragraph",
          "text": "本次分析中反复出现的风险是：省略条件，把答案当作过程证明，把部分数字当成总量。\n\n这只是对本次案例的分析，不是已经完成的传播学研究，也不意味着所有类似说法都出自同一个原因。",
          "_ts": 1794219217065
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "一个自查方法",
          "text": "遇到一个说法，先问四件事：\n\n1. 原始出处是否实际读到了？\n2. 对象、时间和统计范围是否明确？\n3. 这是事实记录、带假设的估算，还是个人猜测？\n4. 当前证据不足时，应该保留哪一部分未知？\n\n前三问答不上来，就不要把这句话写成确定结论。",
          "_ts": 1794219221917
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "c-revise",
            "c-method",
            "c-open"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 3,
          "items": [
            {
              "label": "DeepSeek-AI：《DeepSeek-V3技术报告》v1（2024-12-27）",
              "url": "https://arxiv.org/html/2412.19437v1#S1"
            },
            {
              "label": "《人工智能前沿与创新》课程大作业要求：认知地图与资料规范",
              "url": "https://ai-course-assignment.app.workbuddy.host/#assignment"
            }
          ]
        },
        {
          "type": "files",
          "title": "相关记录",
          "items": [
            {
              "name": "四问模板：两轮比较的完整记录",
              "url": "https://fvymyhy98d-netizen.github.io/living-maps2/#/p/c-method"
            },
            {
              "name": "判断与复盘：我的判断怎样推进",
              "url": "https://fvymyhy98d-netizen.github.io/living-maps2/#/p/c-revise4"
            }
          ],
          "_ts": 1794219247300
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "待核实",
          "text": "这些案例只对应本次两轮问答和费用核对，不等于整个领域的结论。\n\n关于模型规模、量化、微调或上下文的其他说法，若要新增，需要另读具体版本、实验条件与原始数据；不能因为旧模板里写过，就直接当作正确内容保留。",
          "_ts": 1794219258322
        }
      ],
      "heroStyle": {}
    },
    {
      "id": "c-tradeoff",
      "kind": "page",
      "icon": "⚖️",
      "label": "三角权衡",
      "title": "什么时候查证，什么时候可以估计？",
      "description": "固定预算下，这三者互相挤压。理解权衡，比记住任何\"最佳配置\"都有用。",
      "heroAlign": "",
      "parent": "cognition",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "能给出一个数，不等于这个数有依据。不同任务可以接受不同程度的不确定性，但要把事实、带假设的估算和个人猜测分开。",
          "_ts": 1794222329616
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话",
          "text": "能给出一个数，不等于这个数有依据。不同任务可以接受不同程度的不确定性，但要把性质说清楚。",
          "_ts": 1794222333797
        },
        {
          "type": "heading",
          "level": 2,
          "text": "三种典型取舍"
        },
        {
          "type": "table",
          "title": "三种任务下的取舍",
          "headers": [
            "任务",
            "可以怎么处理",
            "必须保留的说明"
          ],
          "rows": [
            [
              "核查实际支出",
              "原始记录不足时不报确定总额",
              "已知什么、缺什么"
            ],
            [
              "预算或情景分析",
              "在明确假设下列分项或区间",
              "不是实际账单，假设可能不成立"
            ],
            [
              "快速探索",
              "先记直觉，重要决策前再核查",
              "不把猜测写成事实"
            ]
          ]
        },
        {
          "type": "paragraph",
          "text": "**我的实际选择：第二轮里，我不把缺数据而保留未知的简略资料组判错，同时说明自己更偏向主动估价。**\n**\n**\n**两种态度可以并存。评价一份事实回答，与讨论一个粗略预算，不是同一件事。**\n**\n**\n**我猜测过DeepSeek-V3全部研发约1500万美元，但没有提供分项、来源或计算方法。这是个人粗略猜测，不是已经完成的预算测算，也不能当作实际账单。**",
          "_ts": 1794222403368
        },
        {
          "type": "chart",
          "chartType": "bar",
          "title": "虚构训练记录中的两项金额",
          "labels": [
            "表内算力费用",
            "加上数据整理费"
          ],
          "data": [
            320,
            400
          ],
          "unit": "美元"
        },
        {
          "type": "paragraph",
          "text": "这是虚构“青岚-Q7”材料中的算术结果，不是实际项目账单。\n\n400美元只包含表格算力费用和数据整理费，人工费用仍未记录，因此不能当作完整项目成本。",
          "_ts": 1794222438040
        },
        {
          "type": "heading",
          "level": 2,
          "text": "时间与查证范围也有限",
          "_ts": 1794222461497
        },
        {
          "type": "paragraph",
          "text": "本次来源查证预先限制搜索与跟进范围。两条新闻没取得正文后，记录失败，而不是为了找出一个数无限搜索。\n\n这只说明这次查证怎样安排，没有测量或证明效率改善，也不等于任何情况下都应尽快停止核实。",
          "_ts": 1794222465205
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "一个容易忽略的权衡",
          "text": "**“保守回答是否合理”与“答案有没有帮助”可以分别评价。**\n**\n**\n**完整资料组多拿到80美元信息，能给出更完整的已记录金额；简略资料组不乱填也仍然合理。**\n**\n**\n**更多信息不自动意味着完整信息。**",
          "_ts": 1794222469840
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "c-causal",
            "c-boundary",
            "c-open",
            "c-method"
          ],
          "note": ""
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 2,
          "items": [
            {
              "label": "DeepSeek-AI：《DeepSeek-V3技术报告》v1（2024-12-27）",
              "url": "https://arxiv.org/html/2412.19437v1#S1"
            },
            {
              "label": "《人工智能前沿与创新》课程大作业要求：认知地图与资料规范",
              "url": "https://ai-course-assignment.app.workbuddy.host/#assignment"
            }
          ]
        },
        {
          "type": "files",
          "title": "继续阅读",
          "items": [
            {
              "name": "能力边界：本人参与、AI辅助与未开展的工作",
              "url": "https://fvymyhy98d-netizen.github.io/living-maps2/#/p/c-boundary"
            },
            {
              "name": "未解问题：本次还没弄清什么",
              "url": "https://fvymyhy98d-netizen.github.io/living-maps2/#/p/c-open"
            }
          ],
          "_ts": 1794222518062
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "还没弄清",
          "text": "如何构造有依据的分项预算，仍待学习。页面中的1500万美元只是个人粗略猜测，没有费用项、来源或区间。\n\n本页没有开展规模、数据、算力最优配比实验，也不声称选择或训练过26M模型。若小组保留原“三角权衡”主题，应另外准备和核实相应内容，本页案例不能替代它。",
          "_ts": 1794222527704
        }
      ],
      "heroStyle": {}
    },
    {
      "id": "c-debug",
      "kind": "page",
      "icon": "🔧",
      "label": "排障方法",
      "title": "答案不完整时，先查哪里？",
      "description": "把\"模型不行\"拆成可验证的假设。八种典型症状，对应八条排查路径。",
      "heroAlign": "",
      "parent": "cognition",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "这一页用本次测试与查证中实际出现的问题，示范怎样把“模型不行”拆成可检查的环节。重点不是给模型贴标签，而是先判断问题出在缺资料、获取失败、口径误读，还是计算或单位错误。",
          "_ts": 1794219299177
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话",
          "text": "先区分“缺资料、没取到资料、误读范围、算错或单位错”，不要一遇到问题就归为模型能力不行。",
          "_ts": 1794219301975
        },
        {
          "type": "heading",
          "level": 2,
          "text": "四种现象与检查路径",
          "_ts": 1794219314957
        },
        {
          "type": "table",
          "title": "先查信息来源，再判断回答",
          "headers": [
            "现象",
            "先查什么",
            "后续处理"
          ],
          "rows": [
            [
              "不能给出一个金额",
              "输入是否包含必要费用",
              "缺资料就保留未知，或补充记录"
            ],
            [
              "搜到文章但无法核查",
              "是否实际取得可读正文",
              "标明失败，不按标题下结论"
            ],
            [
              "把部分金额当成总数",
              "原文的包含与排除项",
              "缩小结论范围"
            ],
            [
              "工时或费用看起来不对",
              "单位、并行条件、算式",
              "分开核对，不把GPU小时当墙钟时间"
            ]
          ]
        },
        {
          "type": "paragraph",
          "text": "**先从成本最低、最容易验证的假设开始：输入里有没有这项信息，正文是否真的读到，单位是否一致。**\n**\n**\n**这些确认之后，再讨论模型能力或更大的系统问题。否则容易把一个信息缺失，误判成模型不会回答。**",
          "_ts": 1794219333184
        },
        {
          "type": "heading",
          "level": 2,
          "text": "一次真实的检查过程",
          "_ts": 1794219347090
        },
        {
          "type": "paragraph",
          "text": "目标是寻找DeepSeek-V3实际总研发费用。\n\n第一步，读原报告，确认557.6万美元只对应正式训练估算。第二步，按预先限定的范围搜索补充来源。第三步，一篇新闻返回成功状态码但没有可读正文，另一篇抓取失败。第四步，记录证据不足，没有给出未经支持的精确总研发金额。\n\n这里识别的是证据缺口，没有修复远程网站，也没有确定抓取失败的具体原因。",
          "_ts": 1794219350144
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "比较时只改变计划中的条件",
          "text": "**第二轮两组使用同一张表格、相同问题和配置，只给其中一组追加备注。保存的提示词已用程序核对，除备注外文字一致。**\n**\n**\n**但追加的是一组备注，不能进一步声称分别测出了每条备注的独立效果。一次比较能回答什么，要受条件设计限制。**",
          "_ts": 1794219358310
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "n-train",
            "c-method",
            "c-misconception"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 2,
          "items": [
            {
              "label": "DeepSeek-AI：《DeepSeek-V3技术报告》v1（2024-12-27）",
              "url": "https://arxiv.org/html/2412.19437v1#S1"
            },
            {
              "label": "《人工智能前沿与创新》课程大作业要求：认知地图与资料规范",
              "url": "https://ai-course-assignment.app.workbuddy.host/#assignment"
            }
          ]
        },
        {
          "type": "files",
          "title": "实际工具与记录",
          "items": [
            {
              "name": "四问模板：两轮比较的完整记录",
              "url": "https://fvymyhy98d-netizen.github.io/living-maps2/#/p/c-method"
            },
            {
              "name": "能力边界：本人参与、AI辅助与未开展的工作",
              "url": "https://fvymyhy98d-netizen.github.io/living-maps2/#/p/c-boundary"
            }
          ],
          "_ts": 1794219381667
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "待核实",
          "text": "本次查证实际使用了网页搜索、网页抓取和程序化算术核对。没有使用训练日志、W&B、学习率调参或PyTorch故障复现，因此本页不把这些写成做过的工作。\n\n一条网页抓取失败，不等于该网页永久不可用，也不等于现实中不存在相应信息。具体失败原因本次未知。",
          "_ts": 1794219394798
        }
      ],
      "heroStyle": {}
    },
    {
      "id": "c-boundary",
      "kind": "page",
      "icon": "🚧",
      "label": "能力边界",
      "title": "我实际参与到哪一步？",
      "description": "哪些是我们真跑过的，哪些只读懂了论文，哪些完全没碰。写清楚边界，比假装全会更可信。",
      "heroAlign": "",
      "parent": "cognition",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "这一页区分三种情况：我亲自作出判断，AI辅助执行与初步核对，以及本次完全没有开展的工作。写清边界，是为了让页面上的“已完成”有依据，而不是把听过、看过都写成做过。",
          "_ts": 1794218872216
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话",
          "text": "区分本人参与、AI辅助执行和没有开展的事，比统一标“跑过”更准确。",
          "_ts": 1794218876206
        },
        {
          "type": "heading",
          "level": 2,
          "text": "我们的实际分布"
        },
        {
          "type": "table",
          "title": "本次实际参与程度",
          "headers": [
            "内容",
            "当前状态",
            "证据与限制"
          ],
          "rows": [
            [
              "提出初始判断",
              "本人参与",
              "有原话，尚未看本次结果时记录"
            ],
            [
              "指出样本不足",
              "本人参与",
              "首轮后亲自撰写结果判断"
            ],
            [
              "选择第二轮比较条件",
              "本人选择",
              "简略资料 vs 完整资料"
            ],
            [
              "执行模型测试、保存记录",
              "AI辅助执行",
              "有完整提示词及首次回答，并非本人手工运行"
            ],
            [
              "成本范围与第二轮Q2评价",
              "本人参与部分复核",
              "未独立复核全部题目"
            ],
            [
              "模型训练、LoRA、RLHF、部署、显存实测",
              "本次未开展",
              "不能标“跑过”；组员若做过需另附记录与责任人"
            ],
            [
              "每周检查",
              "本人选择的计划",
              "当前只有本次整理，没有跨周实施证据"
            ]
          ]
        },
        {
          "type": "heading",
          "level": 2,
          "text": "为什么要把\"没做到\"写出来"
        },
        {
          "type": "paragraph",
          "text": "**讨论模型的训练成本，不等于训练过模型；能看懂一份问答，也不自动证明能独立解释所有概念。公开资料里的实验由作者完成，不能写成自己或小组做过。**\n**\n**\n**写清边界，是为了限定本页结论能够支撑的范围，也方便下一步知道该补什么证据。**",
          "_ts": 1794218939426
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "一个具体的例子",
          "text": "第二轮第二题中，我认可简略资料组保留未知是合理的，这是我的评价记录。其他题目的数值和边界主要由AI初核。\n\n因此可以写“参与关键题复核”，不能写“人工双评了全部题目”，也不能写“我们独立完成了模型评测”。",
          "_ts": 1794218946361
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "c-open",
            "n-align",
            "c-revise"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 2,
          "items": [
            {
              "label": "DeepSeek-AI：《DeepSeek-V3技术报告》v1（2024-12-27）",
              "url": "https://arxiv.org/html/2412.19437v1#S1"
            },
            {
              "label": "《人工智能前沿与创新》课程大作业要求：认知地图与资料规范",
              "url": "https://ai-course-assignment.app.workbuddy.host/#assignment"
            }
          ]
        },
        {
          "type": "files",
          "title": "相关记录",
          "items": [
            {
              "name": "四问模板：两轮比较的完整记录",
              "url": "https://fvymyhy98d-netizen.github.io/living-maps2/#/p/c-method"
            },
            {
              "name": "判断与复盘：我的判断怎样推进",
              "url": "https://fvymyhy98d-netizen.github.io/living-maps2/#/p/c-revise"
            }
          ],
          "_ts": 1794218991531
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "这份边界记录会更新",
          "text": "以后实际完成新任务时再更新状态，并留下日期与证据。\n\n当前版本只记录2026年11月9日这次整理的实际情况。不补写尚未发生的跨周检查、外组反馈或网站发布。",
          "_ts": 1794218974038
        }
      ],
      "heroStyle": {}
    },
    {
      "id": "c-open",
      "kind": "page",
      "icon": "❓",
      "label": "未解问题",
      "title": "本次还没弄清什么？",
      "description": "涌现是不是真的、对齐税有多大、有效上下文有多长、中文配比怎么定。四条我们不敢下结论的。",
      "heroAlign": "",
      "parent": "cognition",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "这一页把“本次没测”“暂时没查到”和“还没学会”分开记录。它们都是下一步行动的入口，不等于整个领域没有答案，也不等于我们已经系统调查过学术前沿。",
          "_ts": 1794219028536
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话",
          "text": "把“本次没测、暂时没查到、尚未学会”和“整个领域没有定论”分开。个人学习缺口也值得记录。",
          "_ts": 1794219034477
        },
        {
          "type": "heading",
          "level": 2,
          "text": "四个具体问题",
          "_ts": 1794219052872
        },
        {
          "type": "paragraph",
          "text": "**一、换材料、模型或增加重复后，资料作用是否稳定？**\n**本次每个条件只运行一次，不能判断一般效果。下一步可以预先设计不同题型与重复计划，并保留全部结果，而不只挑出有差异的题。**",
          "_ts": 1794219057265
        },
        {
          "type": "paragraph",
          "text": "**二、未明确要求查证时，模型会不会主动搜索？**\n**两轮测试都限制信息获取工具；另一次搜索是我明确安排的工具演示。下一步可以另设允许工具的条件，并记录实际调用，不能从答案内容反推它搜索过。**",
          "_ts": 1794219060265
        },
        {
          "type": "paragraph",
          "text": "**三、DeepSeek-V3实际总研发费用精确是多少？**\n**本次所查可读材料不足以确定。下一步可以继续找同一模型、同一时间及同一统计口径的可靠原始记录；如果仍然不足，就保留未知，不报一个确定总额。**",
          "_ts": 1794219064266
        },
        {
          "type": "paragraph",
          "text": "**四、怎样从直觉估价走到有依据的预算？**\n**我只有约1500万美元的个人粗略猜测，没有费用分项。下一步可以列出费用项、假设、范围和待补信息，做成明确的预算草案，但不能把它冒充成实际账单。**",
          "_ts": 1794219067614
        },
        {
          "type": "table",
          "title": "四个问题的现状",
          "headers": [
            "问题",
            "当前状态",
            "可开展的下一步"
          ],
          "rows": [
            [
              "换材料、模型或增加重复后，资料作用是否稳定",
              "本次每条件仅一次",
              "预设不同题型与重复计划，保留全部结果"
            ],
            [
              "未明确要求查证时，模型会不会主动搜索",
              "两轮限制信息工具",
              "另设允许工具条件，并记录实际调用"
            ],
            [
              "DeepSeek-V3实际总研发费用",
              "本次可读材料不足",
              "查同模型同口径的可靠原始记录；不足则不报总数"
            ],
            [
              "怎样做有依据的估价",
              "尚未做分项预算",
              "列费用项、假设、范围与待补信息"
            ]
          ]
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "为什么把这些写出来",
          "text": "首轮两组同分后，我提出样本不足，随后选择了第二轮的比较条件。这是已经发生的问题怎样推动下一步行动，不需要编造“过去大部分实验都由此产生”的经历。\n\n未知可以成为下一步任务，但不能把自己的知识缺口写成整个领域都没有答案。",
          "_ts": 1794219094575
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "c-boundary",
            "c-misconception",
            "c-revise"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 3,
          "items": [
            {
              "label": "DeepSeek-AI：《DeepSeek-V3技术报告》v1（2024-12-27）",
              "url": "https://arxiv.org/html/2412.19437v1#S1"
            },
            {
              "label": "《人工智能前沿与创新》课程大作业要求：认知地图与资料规范",
              "url": "https://ai-course-assignment.app.workbuddy.host/#assignment"
            }
          ]
        },
        {
          "type": "files",
          "title": "继续查证",
          "items": [
            {
              "name": "四问模板：两轮比较的完整记录",
              "url": "https://fvymyhy98d-netizen.github.io/living-maps2/#/p/c-method"
            },
            {
              "name": "领域：评测",
              "url": "https://fvymyhy98d-netizen.github.io/living-maps2/#/p/n-eval"
            },
            {
              "name": "生态：评测体系",
              "url": "https://fvymyhy98d-netizen.github.io/living-maps2/#/p/e-eval"
            }
          ],
          "_ts": 1794219116990
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "说明",
          "text": "本次没有做完整文献综述，也没有运行标准榜单。因此，本页只记录我们实际遇到的未知和下一步，不声称某个学术问题在全世界没有定论。\n\n没有读过的涌现、对齐税等文献，不作为本页已核实依据；若要扩展，需要另查原文和适用条件。",
          "_ts": 1794219128009
        }
      ],
      "heroStyle": {}
    },
    {
      "id": "c-method",
      "kind": "page",
      "icon": "🧩",
      "label": "四问模板",
      "title": "用四个问题组织一次可复查的比较",
      "description": "是什么、怎么做、凭什么、还没弄清。每条知识都按这个模板写，就不会写成\"看起来懂\"。",
      "heroAlign": "",
      "parent": "cognition",
      "blocks": [
        {
          "type": "paragraph",
          "size": "lead",
          "text": "本页用两轮实际问答比较，示范怎样组织问题、过程、证据和局限。测试由AI助手执行，我参与提出判断、选择比较条件和评价关键结果。目的不是评出最强模型，而是让分析过程能够被检查。",
          "_ts": 1794217435978
        },
        {
          "type": "callout",
          "tone": "blue",
          "title": "一句话",
          "text": "是什么、怎么做、凭什么、还没弄清——四问帮助整理证据，不是填完就证明掌握。",
          "_ts": 1794217453408
        },
        {
          "type": "heading",
          "level": 2,
          "text": "四问分别检查什么",
          "_ts": 1794217601293
        },
        {
          "type": "table",
          "title": "一次比较需要交代的四件事",
          "headers": [
            "问题",
            "要写清什么",
            "本次案例中的对应内容"
          ],
          "rows": [
            [
              "是什么",
              "想检验的具体问题",
              "提供参考资料后，回答是否更准确，能否回答更多问题？"
            ],
            [
              "怎么做",
              "材料、比较条件、操作步骤，以及谁执行",
              "两个独立新会话使用相同模型配置和问题，只改变提供的资料；由AI助手执行。"
            ],
            [
              "凭什么",
              "原始输入输出、资料来源和核对标准",
              "保留两轮提示词、首次完整回答和核对记录；我参与关键结果评价。"
            ],
            [
              "还没弄清",
              "样本限制、缺失信息和未测试的情境",
              "每个条件仅运行一次，不能据此判断一般效果；我没有独立复核全部题目。"
            ]
          ],
          "_ts": 1794217607203
        },
        {
          "type": "heading",
          "level": 2,
          "text": "第一轮比较：不附原文与附原文",
          "_ts": 1794217617572
        },
        {
          "type": "paragraph",
          "text": "是什么：观察给模型提供参考资料后，回答是否更准确。\n\n怎么做：AI助手建立两个独立新会话，使用相同的平台模型配置标签astra/gpt-6-astra和medium推理设置，回答相同的6道题。一组不附原文，另一组附上DeepSeek-V3技术报告v1中的4段原句。两组都要求不调用信息获取工具，并在信息不足时明确说明。DeepSeek-V3是题目讨论的对象，不是这次受测的模型。\n\n凭什么：题目、评分标准在测试前确定，首次完整回答均已保留。按照每题0—2分的标准，AI初步核对两组均为12/12。附原文组标注了对应的材料片段，便于回查；不附原文组标注依据为已有知识或计算。本轮没有观察到正确性差异，不能据此断言提供资料通常有效或无效。\n\n我的判断：可以发现，本次两组都答对了，于是我就觉得测试样本量不足，还需要进一步测试。\n\n还没弄清：公开报告中的信息可能本来就在模型已有知识中。每组仅运行一次，题目少且相关；温度和随机种子未由我们控制，评分也不是盲评。我参与了成本范围讨论，但没有独立复核全部6题。两组事后自报未使用信息获取工具，这不等于完整的独立日志审计。",
          "_ts": 1794217633301
        },
        {
          "type": "heading",
          "level": 2,
          "text": "第二轮比较：简略资料与完整资料",
          "_ts": 1794217672837
        },
        {
          "type": "paragraph",
          "text": "是什么：观察补充关键备注后，模型能否回答更多问题，以及面对缺失信息时是否会乱猜。这次“简略资料与完整资料”的比较条件由我选择。\n\n测试材料：AI助手编写了一份完全虚构的“青岚-Q7”教学训练记录，不对应真实项目。表中预训练、指令微调、评测分别使用120、30、10 GPU小时，假设租价均为每GPU小时2美元。\n\n怎么做：两组都收到同一张表格和相同的4道题，使用相同模型配置，在独立新会话中作答。只有完整资料组额外收到备注：数据整理另花80美元，人工费用未记录，实际运行时长和GPU数量未记录。两组均要求不调用信息获取工具。提示词已核对，除备注外文字一致。\n\n观察结果：\n① 表内算力费用：两组都算出320美元。\n② 加上数据整理费后的合计：简略资料组因不知道整理费金额，表示无法确定；完整资料组算出400美元，并指出这不是全部项目成本。\n③ 包含人工费用的完整成本：两组都表示信息不足。\n④ 实际运行时长：两组都指出160 GPU小时不能直接当成160小时的实际运行时间，现有信息不足以确定。\n\n我的评价：不应该把简略资料组在第二题的回答判错。我觉得面对未知，偏保守也是合理的，不过我通常偏激进，会直接估价。\n\n当前分析：完整资料组获得了额外事实，因此能回答得更具体；简略资料组没有编造缺失金额，也是合理回答。这里应区分“能回答多少”和“已经回答的内容是否正确”，不能把合理保留未知直接算成错误。\n\n还没弄清：每个条件仍只运行一次，4道题也不是4次独立实验。提示中明确要求不编造，会影响表现。我参与了第二题的评价，其余题目主要由AI初核。本轮不能证明模型从不乱猜，也不能和第一轮合并成一个准确率。虚构的是输入材料，保存的模型回答是实际测试结果。",
          "_ts": 1794217681487
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "这次比较带来的下一步",
          "text": "第一轮两组都答对后，我没有直接断言资料有用或没用，而是提出样本量不足，还需要进一步测试。随后，我选择了“简略资料与完整资料”的比较条件。\n\n第二轮中，我认为缺少信息时保守回答是合理的，同时保留自己更倾向于估价的偏好。这是本次实际发生的判断过程，不代表我已经掌握模型原理，也不是为了作业而强行制造观点反转。",
          "_ts": 1794217735362
        },
        {
          "type": "related",
          "title": "相关条目",
          "mode": "card",
          "cols": 3,
          "links": [
            "c-causal",
            "c-boundary",
            "c-open"
          ]
        },
        {
          "type": "sources",
          "title": "本页来源",
          "seq": 2,
          "items": [
            {
              "label": "DeepSeek-AI：《DeepSeek-V3技术报告》v1，第1节及表1（2024-12-27）",
              "url": "https://arxiv.org/html/2412.19437v1#S1"
            },
            {
              "label": "《人工智能前沿与创新》课程大作业要求：认知地图与资料规范",
              "url": "https://ai-course-assignment.app.workbuddy.host/#assignment"
            }
          ],
          "_ts": 1794217834542
        },
        {
          "type": "files",
          "title": "继续阅读",
          "items": [
            {
              "name": "判断与复盘：我的判断怎样推进",
              "url": "https://fvymyhy98d-netizen.github.io/living-maps2/#/p/c-revise"
            },
            {
              "name": "能力边界：本人参与、AI辅助与未开展的工作",
              "url": "https://fvymyhy98d-netizen.github.io/living-maps2/#/p/c-boundary"
            }
          ],
          "_ts": 1794217968444
        },
        {
          "type": "callout",
          "tone": "orange",
          "title": "局限",
          "text": "四问模板帮助组织分析，但不能替代原文核对、实际测试或自己的解释。\n\n本次只有两轮小型比较，各条件均只运行一次，不能据此判断模型的整体能力或资料在所有任务中的效果。\n\n测试由AI助手执行并初步核对，我参与比较条件选择和关键结果评价，没有独立复核全部题目。\n\n本次只是资料辅助问答，没有训练或微调模型，也没有实现完整的自动检索增强生成（RAG）系统。\n\n目前不知道的内容可以如实列出，再说明下一步怎样核实，不必把自己的知识缺口写成整个领域的未解难题。",
          "_ts": 1794217744818
        },
        {
          "type": "paragraph",
          "size": "normal",
          "text": "证据说明：两轮提示词、首次完整回答及核对记录已保存在本地证据包中，尚未上传本站。当前不能通过本页直接下载；上传后再补充实际可访问的附件链接。",
          "color": ""
        }
      ],
      "heroStyle": {}
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
