import { LocalStorage } from "@raycast/api";
import fs from "node:fs/promises";
import path from "node:path";
import { getToolDefinition, toolDefinitions } from "./tools";
import {
  ParsedSkill,
  SkillKind,
  SkillRecord,
  ToolDefinition,
  ToolId,
} from "./types";

const CACHE_KEY = "cached-skills-v1";
const FAVORITES_KEY = "favorite-skill-ids-v1";

interface CachedSkills {
  savedAt: string;
  skills: SkillRecord[];
}

export async function getCachedSkills() {
  const raw = await LocalStorage.getItem<string>(CACHE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as CachedSkills;
    return parsed.skills ?? [];
  } catch {
    return [];
  }
}

export async function getFavoriteSkillIds() {
  const raw = await LocalStorage.getItem<string>(FAVORITES_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function setFavoriteSkillIds(ids: string[]) {
  await LocalStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
}

export async function scanSkills() {
  const skillMap = new Map<string, SkillRecord>();

  for (const tool of toolDefinitions) {
    for (const root of tool.scanRoots) {
      const files = await collectSkillFiles(root);

      for (const filePath of files) {
        const record = await buildSkillRecord(filePath, root, tool);
        if (!record) {
          continue;
        }

        const existing = skillMap.get(record.realPath);
        if (existing) {
          existing.tools = Array.from(
            new Set([...existing.tools, ...record.tools]),
          );
          continue;
        }

        skillMap.set(record.realPath, record);
      }
    }
  }

  const skills = Array.from(skillMap.values()).sort((left, right) =>
    left.title.localeCompare(right.title),
  );
  await LocalStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      savedAt: new Date().toISOString(),
      skills,
    } satisfies CachedSkills),
  );
  return skills;
}

async function collectSkillFiles(root: string) {
  try {
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const matches: string[] = [];
  await walkSkillRoot(root, root, 0, matches);
  return matches;
}

async function walkSkillRoot(
  root: string,
  currentDir: string,
  depth: number,
  matches: string[],
) {
  if (depth > 4) {
    return;
  }

  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await walkSkillRoot(root, fullPath, depth + 1, matches);
      continue;
    }

    if (entry.isFile() && isSkillCandidate(root, fullPath)) {
      matches.push(fullPath);
    }
  }
}

function isSkillCandidate(root: string, filePath: string) {
  const name = path.basename(filePath);
  if (name === "SKILL.md") {
    return true;
  }

  const extension = path.extname(filePath);
  if (extension !== ".md" && extension !== ".mdc") {
    return false;
  }

  return path.dirname(filePath) === root;
}

async function buildSkillRecord(
  filePath: string,
  root: string,
  tool: ToolDefinition,
): Promise<SkillRecord | null> {
  try {
    const [content, realPath] = await Promise.all([
      fs.readFile(filePath, "utf8"),
      fs.realpath(filePath),
    ]);
    const parsed = parseSkill(filePath, content);
    const relativePath =
      path.relative(root, filePath) || path.basename(filePath);
    const keywords = Array.from(
      new Set(
        [
          parsed.title,
          parsed.description,
          path.basename(filePath),
          relativePath,
          tool.title,
        ]
          .join(" ")
          .toLowerCase()
          .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
          .filter(Boolean),
      ),
    );

    return {
      id: realPath,
      title: parsed.title,
      description: parsed.description,
      filePath,
      realPath,
      relativePath,
      tools: [tool.id],
      kind: parsed.kind,
      content,
      keywords,
    };
  } catch {
    return null;
  }
}

function parseSkill(filePath: string, content: string): ParsedSkill {
  const kind = inferKind(filePath);
  const frontmatter = readFrontmatter(content);
  const title =
    frontmatter.name ||
    frontmatter.title ||
    readFirstHeading(content) ||
    inferTitleFromPath(filePath);
  const description =
    frontmatter.description ||
    readFirstParagraph(content) ||
    `Skill file at ${path.basename(filePath)}`;

  return {
    title,
    description,
    kind,
  };
}

function inferKind(filePath: string): SkillKind {
  if (path.basename(filePath) === "SKILL.md") {
    return "skill-md";
  }
  if (path.extname(filePath) === ".mdc") {
    return "mdc";
  }
  return "markdown";
}

function readFrontmatter(content: string) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return {} as Record<string, string>;
  }

  const values: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const parsed = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (parsed) {
      values[parsed[1]] = parsed[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return values;
}

function readFirstHeading(content: string) {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      return trimmed.replace(/^# /, "").trim();
    }
  }
  return "";
}

function readFirstParagraph(content: string) {
  const body = content
    .replace(/^---\n[\s\S]*?\n---\n?/, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => !line.startsWith("#") && !line.startsWith("!"));

  return body ?? "";
}

function inferTitleFromPath(filePath: string) {
  if (path.basename(filePath) === "SKILL.md") {
    return path.basename(path.dirname(filePath));
  }
  return path.basename(filePath, path.extname(filePath));
}

export async function installSkill(skill: SkillRecord, targetTool: ToolId) {
  const { filePath, slug, tool } = getInstallTargetInfo(skill, targetTool);
  if (await fileExists(filePath)) {
    throw new Error(
      `A skill named "${slug}" already exists in ${tool.title}. Rename or remove the existing file first.`,
    );
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    normalizeInstalledContent(skill, targetTool, slug),
    "utf8",
  );
  return filePath;
}

export async function getInstallConflictMessage(
  skill: SkillRecord,
  targetTool: ToolId,
) {
  const { filePath, slug, tool } = getInstallTargetInfo(skill, targetTool);
  const exists = await fileExists(filePath);

  return {
    exists,
    slug,
    toolTitle: tool.title,
    filePath,
    message: exists
      ? `A skill named "${slug}" already exists in ${tool.title}. Installing now would fail until you rename or remove the existing file.`
      : `This will copy "${skill.title}" into ${tool.title} as "${slug}".`,
  };
}

export async function updateSkillContent(filePath: string, content: string) {
  await fs.writeFile(filePath, ensureTrailingNewline(content), "utf8");
}

export function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function renderSkillTemplate(
  toolId: ToolId,
  kind: SkillKind,
  title: string,
  description: string,
  body: string,
  slug: string,
) {
  const frontmatter = `---\nname: ${slug}\ndescription: ${description}\n---`;
  const normalizedBody =
    body.trim() ||
    "Describe what the skill should do, how it should behave, and any important constraints.";

  if (toolId === "codex" || kind === "skill-md") {
    return `${frontmatter}\n\n${normalizedBody}\n`;
  }

  return `${frontmatter}\n\n# ${title}\n\n${normalizedBody}\n`;
}

function normalizeInstalledContent(
  skill: SkillRecord,
  targetTool: ToolId,
  slug: string,
) {
  if (targetTool === "codex") {
    if (skill.kind === "skill-md") {
      return skill.content;
    }
    return renderSkillTemplate(
      targetTool,
      "skill-md",
      skill.title,
      skill.description,
      stripFrontmatter(skill.content),
      slug,
    );
  }

  return renderSkillTemplate(
    targetTool,
    "markdown",
    skill.title,
    skill.description,
    stripFrontmatter(skill.content),
    slug,
  );
}

function stripFrontmatter(content: string) {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

function ensureTrailingNewline(content: string) {
  return content.endsWith("\n") ? content : `${content}\n`;
}

function getInstallTargetInfo(skill: SkillRecord, targetTool: ToolId) {
  const tool = getToolDefinition(targetTool);
  if (!tool.createTarget) {
    throw new Error(
      `${tool.title} cannot receive installed skills in this version.`,
    );
  }

  const slug = slugify(skill.title);
  const filePath = tool.createTarget(slug);

  return { filePath, slug, tool };
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
