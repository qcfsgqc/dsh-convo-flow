# dsh-convo-flow

DeepSeek Harness Web 插件。把对应对话画成工作流：一个会话一个节点，父会话在上，子代理按派生边挂下去。

两种入口：

- 会话页「工作流」页签：当前这条会话的整棵血缘
- 侧栏底部「全机工作流」：这台 DSH 的全部工作区

两种密度，记在本地：

- 简洁：标题、状态点、父子边
- 详细：节点里铺模型、用量、最近一轮用户原文和回复。图变高，不另开抽屉

点节点用官方会话 API 打开那条对话。只读，不替换 `tool-subagent`，不另建库。

## 安装

```bash
dsh plugin --profile web add github:qcfsgqc/dsh-convo-flow
```

重启 `dsh web`，硬刷新。会话页应出现「工作流」，侧栏底部应出现「全机工作流」。

要求 Web profile，DSH `>=0.1.2-rc.1`。这是客户端视图插件，不是 VS Code 扩展。
