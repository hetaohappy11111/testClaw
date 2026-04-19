---
name: web-search
description: "搜索互联网获取信息、文档和资源"
user-invocable: true
priority: 15
---

# 网页搜索技能 (ReAct 模式)

## 执行流程

### Step 1: 分析查询
理解用户要搜索的内容

### Step 2: 选择搜索工具
- TavilySearch: 更精确的搜索（有 API key 时使用）
- WebSearch: 通用搜索（备用）

### Step 3: 执行搜索
TOOL_CALL: TavilySearch | query=搜索关键词

### Step 4: 获取详情（可选）
如果需要获取具体页面的详细内容：
TOOL_CALL: TavilyFetch | url=页面URL

### Step 5: 输出结果
输出 Final Answer

```
Final Answer:

搜索结果：
1. 标题
   摘要...

2. 标题
   摘要...
```

## 重要规则

1. 先搜索，再根据需要获取详情
2. 提供清晰的标题和摘要
3. 输出 Final Answer 结束任务