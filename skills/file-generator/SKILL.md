---
name: file-generator
description: "Generate files from templates with code execution"
user-invocable: true
type: code
priority: 10
---

# File Generator Skill

Generates files from templates using JavaScript code.

## Capabilities

- Generate files from templates
- Process template variables
- Create multiple files
- Custom file processing

## Code

```javascript
// File generator skill
// Input: { template: string, variables: object, outputPath: string }
// Returns: { success: boolean, output: string }

const { template, variables, outputPath } = input;

if (!template || !outputPath) {
  return 'Error: template and outputPath required';
}

// Simple template processing
let content = template;
for (const [key, value] of Object.entries(variables || {})) {
  content = content.replace(new RegExp('{{' + key + '}}', 'g'), String(value));
}

return 'Generated: ' + outputPath + '\\nContent length: ' + content.length;
```

## Usage

- "Generate a config file"
- "Create a new file"
- "Generate test file"