# 项目级 Agent 使用说明

本仓库只保留 Agent 记录，默认以 Agent 协作方式工作。

## 可用 Agent
- planner: 负责需求规划与结构化需求文档输出，不写业务实现代码。
- code-generator: 负责按需求文档实施代码与验证，并按步骤进行 Git 提交/推送。
- reviewer: 负责质量审查与门禁结论，输出通过/不通过和阻塞项。

## 新 Session 默认行为
1. 先阅读 `.github/agents/planner.agent.md`、`.github/agents/code-generator.agent.md`、`.github/agents/reviewer.agent.md`。
2. 用户表达“规划/需求拆解”时，优先使用 planner。
3. 用户表达“实现/继续开发/落地代码”时，优先使用 code-generator。
4. 用户表达“审核/验收/是否可合并”时，优先使用 reviewer。

## 语言与输出
- 默认使用中文输出，除非用户明确要求其他语言。
- 输出应包含可执行信息，不停留在抽象建议。

## Git 约定
- 当前仓库远程默认地址：`git@github.com:Gwylinzeed/harness-test.git`。
- 推送失败时允许切换 HTTPS 远程进行推送。
- 仅在用户明确要求时执行提交/推送。

## 变更边界
- 未经用户明确指示，不创建与业务实现相关的新代码文件。
- 允许维护 `.github/agents/` 与本说明文件，作为长期可复用的项目级知识入口。
