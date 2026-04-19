# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

This is a simplified Claude Code-like CLI tool for testing and validation purposes. It demonstrates core agent/CLI functionality with tools, memory, and LLM integration.

## Commands

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Development mode (tsx)
npm run dev

# Run the CLI
npm start

# Interactive mode
npm run interactive
```

## Architecture

- **Framework**: Node.js with TypeScript
- **Entry point**: `src/index.ts`
- **Type**: ES Modules

### Key Directories

- `src/cli/` - CLI argument parsing and commands
- `src/agent/` - Agent core logic
- `src/llm/` - LLM integration
- `src/tools/` - Tool implementations
- `src/memory/` - Memory system
- `src/plugins/` - Plugin system
- `src/skills/` - Skills configuration
- `bin/` - Executable entry point
- `skills/` - Skill definitions
