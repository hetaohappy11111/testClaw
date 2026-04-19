---
name: search-code
description: "Search for code patterns, functions, classes in project files"
user-invocable: true
priority: 10
---

# Search Code

Search and find code patterns in project files.

## Capabilities

- Regex pattern search
- Function definition search
- Class search
- Import search
- File type filtering
- Directory filtering

## When to Use

- Find function definitions
- Search for patterns
- Locate class declarations
- Find imports of libraries
- Search with regex
- Filter by file type

## Usage Examples

- "Search for function main in src/"
- "Find all TODO comments"
- "Search for class definition User"
- "Find imports of lodash"
- "Search async functions"

## Priority Rules

1. If user specifies file type, use glob first
2. If user specifies function name, search for "function name"
3. If user specifies class, search for "class name"


## Tool Usage

- Grep: Search content with pattern
- Glob: Find files by pattern