---
name: git-helper
description: "Git operations - status, log, diff, branch, commit, push, pull"
user-invocable: true
priority: 10
---

# Git Helper

Execute Git version control operations.

## Capabilities

- Check repository status
- View commit history
- Show file differences
- Manage branches
- Create commits
- Push to remote
- Pull from remote
- Merge branches

## When to Use

- Check git status
- View commit logs
- Show diff
- Manage branches
- Create new branch
- Switch branches
- Stage files
- Commit changes
- Push to remote
- Pull updates

## Usage Examples

- "Show git status"
- "What are recent commits"
- "Show diff for src/index.ts"
- "List all branches"
- "Create new branch feature-x"
- "Switch to main branch"

## Priority Rules

1. Parse git command from user input
2. Execute appropriate git command
3. Explain the output