---
name: code-review
description: "代码审查 - 审查代码质量、潜在 bug、安全漏洞并提供结构化反馈"
user-invocable: true
priority: 15
---

# 代码审查技能 (ReAct 模式)

## 执行流程

### Step 1: 分析任务
理解用户要审查的文件或代码

### Step 2: 查找文件
用 Glob 工具查找代码文件（按优先级尝试）：
1. 首先: TOOL_CALL: Glob | pattern=src/**/*.ts
2. 如果没有结果，尝试: TOOL_CALL: Glob | pattern=**/*.ts

注意：如果第一个模式没有返回结果，必须尝试其他模式！

### Step 3: 读取代码
用 Read 工具读取文件内容：
- TOOL_CALL: Read | file_path=文件路径

### Step 4: 分析代码
检查以下问题：
- 安全漏洞 (SQL注入、XSS、命令注入)
- 潜在的 bug
- 性能问题
- 内存泄漏
- 资源未释放
- 代码风格
- 缺少错误处理
- any 类型使用

### Step 5: 输出结果
输出 Final Answer：

```
Final Answer:

## 代码审查报告

### 🔴 严重问题 (Critical)
- [行号] 类型: 描述

### 🟠 主要问题 (Major)
- [行号] 类型: 描述

### 🟡 轻微问题 (Minor)
- [行号] 类型: 描述
```

## 重要规则

1. **必须使用 Read 工具**读取文件
2. **逐行分析**代码
3. **指出具体行号**
4. 输出 **Final Answer** 结束任务