import os from "node:os";
import path from "node:path";
import { ToolDefinition, ToolId } from "./types";

const home = os.homedir();

export const toolDefinitions: ToolDefinition[] = [
  {
    id: "claude",
    title: "Claude",
    subtitle: "Claude Code",
    scanRoots: [
      path.join(home, ".claude", "skills"),
      path.join(home, ".agents", "skills"),
    ],
    createTarget: (slug) => path.join(home, ".claude", "skills", `${slug}.md`),
    createKind: "markdown",
  },
  {
    id: "codex",
    title: "Codex",
    subtitle: "OpenAI Codex",
    scanRoots: [path.join(home, ".codex", "skills")],
    createTarget: (slug) =>
      path.join(home, ".codex", "skills", slug, "SKILL.md"),
    createKind: "skill-md",
  },
  {
    id: "cursor",
    title: "Cursor",
    subtitle: "Cursor Rules",
    scanRoots: [
      path.join(home, ".cursor", "skills"),
      path.join(home, ".cursor", "rules"),
    ],
  },
  {
    id: "windsurf",
    title: "Windsurf",
    subtitle: "Windsurf Rules",
    scanRoots: [
      path.join(home, ".codeium", "windsurf", "memories"),
      path.join(home, ".windsurf", "rules"),
    ],
  },
  {
    id: "amp",
    title: "Amp",
    subtitle: "Amp",
    scanRoots: [path.join(home, ".config", "amp")],
  },
];

export const writableTools = toolDefinitions.filter(
  (tool) => tool.createTarget && tool.createKind,
);

export function getToolDefinition(toolId: ToolId) {
  const tool = toolDefinitions.find((item) => item.id === toolId);
  if (!tool) {
    throw new Error(`Unknown tool: ${toolId}`);
  }
  return tool;
}
