export interface Skill {
  name: string;
  description: string;
  content: string;
  userInvocable: boolean;
}

export interface SkillDefinition {
  name: string;
  description: string;
  user_invocable: boolean;
}

export interface SkillMatch {
  skill: Skill;
  confidence: number;
  matched: string;
}
