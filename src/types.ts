export type ToolId = "claude" | "codex" | "cursor" | "windsurf" | "amp";

export type SkillKind = "markdown" | "mdc" | "skill-md";

export interface ToolDefinition {
  id: ToolId;
  title: string;
  subtitle: string;
  scanRoots: string[];
  createTarget?: (slug: string) => string;
  createKind?: SkillKind;
}

export interface SkillRecord {
  id: string;
  title: string;
  description: string;
  filePath: string;
  realPath: string;
  relativePath: string;
  tools: ToolId[];
  kind: SkillKind;
  content: string;
  keywords: string[];
}

export interface ParsedSkill {
  title: string;
  description: string;
  kind: SkillKind;
}
