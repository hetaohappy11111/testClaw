// 简单的 readline 测试脚本
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
});

console.log('测试 readline 提示符');
console.log('输入命令，按 Enter 确认');
console.log('输入 :quit 退出');
console.log('');

rl.prompt();

rl.on('line', (line) => {
  const input = line.trim();
  
  if (input === ':quit') {
    rl.close();
  } else {
    console.log(`你输入了: ${input}`);
    rl.prompt();
  }
});

rl.on('close', () => {
  console.log('\n测试完成');
  process.exit(0);
});
