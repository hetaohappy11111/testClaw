import { Command } from 'commander';
import { skillLoader } from '../../skills/index.js';

export function registerSkillsCommand(program: Command) {
  program
    .command('skills')
    .description('Manage and list skills')
    .argument('[action]', 'Action to perform (list)')
    .argument('[name]', 'Skill name')
    .action(async (action: string | undefined, name: string | undefined) => {
      if (!action || action === 'list') {
        const skills = skillLoader.getAll();
        console.log('\nAvailable Skills:\n');
        for (const skill of skills) {
          const badge = skill.user_invocable ? ' [user]' : '';
          console.log(`  ${skill.name.padEnd(20)} - ${skill.description}${badge}`);
        }
        console.log();
      } else if (action === 'show' && name) {
        const skill = skillLoader.get(name);
        if (skill) {
          console.log(`\n## ${skill.name}\n${skill.description}\n\n${skill.content}\n`);
        } else {
          console.log(`Skill '${name}' not found`);
        }
      }
    });
}
