import {
  Action,
  ActionPanel,
  Clipboard,
  Color,
  confirmAlert,
  Form,
  Icon,
  List,
  Toast,
  open,
  popToRoot,
  showInFinder,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useMemo, useState } from "react";
import {
  getCachedSkills,
  getInstallConflictMessage,
  getFavoriteSkillIds,
  installSkill,
  scanSkills,
  setFavoriteSkillIds,
  updateSkillContent,
} from "./skills";
import { getToolDefinition, toolDefinitions, writableTools } from "./tools";
import { SkillRecord, ToolId } from "./types";

export default function SearchSkillsCommand() {
  const [selectedTool, setSelectedTool] = useState<ToolId | "all">("all");
  const [searchText, setSearchText] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string>();
  const [detailMode, setDetailMode] = useState<"description" | "body" | "raw">(
    "body",
  );
  const { push } = useNavigation();
  const { data, isLoading, revalidate } = useCachedPromise(scanSkills, [], {
    initialData: [],
    keepPreviousData: true,
  });
  const { data: cachedSkills } = useCachedPromise(getCachedSkills, [], {
    initialData: [],
    keepPreviousData: true,
  });
  const { data: favoriteSkillIds, revalidate: revalidateFavorites } =
    useCachedPromise(getFavoriteSkillIds, [], {
      initialData: [],
      keepPreviousData: true,
    });

  const skills = data.length > 0 ? data : cachedSkills;
  const visibleSkills = useMemo(() => {
    const favorites = new Set(favoriteSkillIds);

    return skills
      .filter((skill) => {
        const matchesTool =
          selectedTool === "all" || skill.tools.includes(selectedTool);
        if (!matchesTool) {
          return false;
        }

        const query = searchText.trim().toLowerCase();
        if (!query) {
          return true;
        }

        const haystack = [
          skill.title,
          skill.description,
          skill.relativePath,
          skill.content,
          ...skill.keywords,
        ]
          .join("\n")
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort((left, right) => {
        const favoriteDelta =
          Number(favorites.has(right.id)) - Number(favorites.has(left.id));
        if (favoriteDelta !== 0) {
          return favoriteDelta;
        }

        return left.title.localeCompare(right.title);
      });
  }, [favoriteSkillIds, searchText, selectedTool, skills]);

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      selectedItemId={selectedItemId}
      searchBarPlaceholder="Search by name, description, or content"
      onSelectionChange={(id) => setSelectedItemId(id ?? undefined)}
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter by Tool"
          value={selectedTool}
          onChange={(value) => setSelectedTool(value as ToolId | "all")}
        >
          <List.Dropdown.Item title="All Tools" value="all" />
          {toolDefinitions.map((tool) => (
            <List.Dropdown.Item
              key={tool.id}
              title={tool.title}
              value={tool.id}
            />
          ))}
        </List.Dropdown>
      }
      throttle
    >
      <List.Section title={`Skills (${visibleSkills.length})`}>
        {visibleSkills.map((skill) => (
          <List.Item
            key={skill.id}
            icon={favoriteSkillIds.includes(skill.id) ? Icon.Star : Icon.Hammer}
            title={skill.title}
            subtitle={skill.description}
            detail={
              <List.Item.Detail
                markdown={renderSkillDetail(skill, detailMode)}
              />
            }
            accessories={[
              ...(favoriteSkillIds.includes(skill.id)
                ? [{ icon: { source: Icon.Star, tintColor: Color.Yellow } }]
                : []),
              ...skill.tools.map((toolId) => ({
                tag: {
                  value: getToolDefinition(toolId).title,
                  color: colorForTool(toolId),
                },
              })),
              { text: skill.relativePath },
            ]}
            actions={
              <ActionPanel>
                <ActionPanel.Section title="View">
                  <Action
                    title="Show Description"
                    icon={Icon.Text}
                    shortcut={{ modifiers: ["cmd"], key: "1" }}
                    onAction={() => {
                      setDetailMode("description");
                      setSelectedItemId(skill.id);
                    }}
                  />
                  <Action
                    title="Show Body"
                    icon={Icon.AlignLeft}
                    shortcut={{ modifiers: ["cmd"], key: "2" }}
                    onAction={() => {
                      setDetailMode("body");
                      setSelectedItemId(skill.id);
                    }}
                  />
                  <Action
                    title="Show Raw File"
                    icon={Icon.Code}
                    shortcut={{ modifiers: ["cmd"], key: "3" }}
                    onAction={() => {
                      setDetailMode("raw");
                      setSelectedItemId(skill.id);
                    }}
                  />
                </ActionPanel.Section>
                <Action
                  title="Edit Skill Content"
                  icon={Icon.Pencil}
                  onAction={() =>
                    push(<EditSkillForm skill={skill} onSaved={revalidate} />)
                  }
                />
                <Action
                  title={
                    favoriteSkillIds.includes(skill.id)
                      ? "Remove Favorite"
                      : "Add Favorite"
                  }
                  icon={
                    favoriteSkillIds.includes(skill.id)
                      ? Icon.StarDisabled
                      : Icon.Star
                  }
                  onAction={async () => {
                    const nextIds = favoriteSkillIds.includes(skill.id)
                      ? favoriteSkillIds.filter((id) => id !== skill.id)
                      : [...favoriteSkillIds, skill.id];

                    await setFavoriteSkillIds(nextIds);
                    await revalidateFavorites();
                    setSelectedItemId(skill.id);
                  }}
                />
                <Action
                  title="Open Skill"
                  icon={Icon.Document}
                  onAction={() => open(skill.filePath)}
                />
                <Action
                  title="Show in Finder"
                  icon={Icon.Finder}
                  onAction={() => showInFinder(skill.filePath)}
                />
                <Action
                  title="Install to Another Tool"
                  icon={Icon.Download}
                  onAction={() =>
                    push(
                      <InstallSkillForm
                        skill={skill}
                        onInstalled={revalidate}
                      />,
                    )
                  }
                />
                <Action
                  title="Copy Skill Path"
                  icon={Icon.CopyClipboard}
                  onAction={() => Clipboard.copy(skill.filePath)}
                />
                <Action
                  title="Copy Skill Content"
                  icon={Icon.TextDocument}
                  onAction={() => Clipboard.copy(skill.content)}
                />
                <Action
                  title="Refresh Skills"
                  icon={Icon.ArrowClockwise}
                  onAction={revalidate}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}

function EditSkillForm(props: {
  skill: SkillRecord;
  onSaved: () => Promise<void> | void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const { pop } = useNavigation();

  return (
    <Form
      isLoading={isSaving}
      navigationTitle={`Edit ${props.skill.title}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Skill"
            icon={Icon.Check}
            onSubmit={async (values: { content: string }) => {
              setIsSaving(true);
              try {
                await updateSkillContent(props.skill.filePath, values.content);
                await props.onSaved();
                await showToast({
                  style: Toast.Style.Success,
                  title: "Skill saved",
                  message: props.skill.title,
                });
                pop();
              } catch (error) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "Could not save skill",
                  message:
                    error instanceof Error ? error.message : "Unknown error",
                });
              } finally {
                setIsSaving(false);
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="content"
        title="Content"
        defaultValue={props.skill.content}
      />
    </Form>
  );
}

function InstallSkillForm(props: {
  skill: SkillRecord;
  onInstalled: () => void;
}) {
  const [isInstalling, setIsInstalling] = useState(false);

  return (
    <List isLoading={isInstalling}>
      <List.Section
        title={props.skill.title}
        subtitle="Choose where to copy this skill"
      >
        {writableTools.map((tool) => (
          <List.Item
            key={tool.id}
            icon={Icon.Folder}
            title={tool.title}
            subtitle={tool.subtitle}
            actions={
              <ActionPanel>
                <Action
                  title="Install Here"
                  onAction={async () => {
                    setIsInstalling(true);
                    try {
                      const conflict = await getInstallConflictMessage(
                        props.skill,
                        tool.id,
                      );
                      const shouldContinue = await confirmAlert({
                        title: `Install into ${tool.title}?`,
                        message: `${conflict.message}\n\nTarget: ${conflict.filePath}`,
                        primaryAction: {
                          title: "Install Skill",
                        },
                      });

                      if (!shouldContinue) {
                        return;
                      }

                      const filePath = await installSkill(props.skill, tool.id);
                      await showToast({
                        style: Toast.Style.Success,
                        title: "Skill installed",
                        message: filePath,
                      });
                      props.onInstalled();
                      await popToRoot();
                    } catch (error) {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: "Install failed",
                        message:
                          error instanceof Error
                            ? error.message
                            : "Unknown error",
                      });
                    } finally {
                      setIsInstalling(false);
                    }
                  }}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}

function colorForTool(toolId: ToolId) {
  switch (toolId) {
    case "claude":
      return Color.Orange;
    case "codex":
      return Color.Green;
    case "cursor":
      return Color.Blue;
    case "windsurf":
      return Color.Purple;
    case "amp":
      return Color.Yellow;
  }
}

function renderSkillDetail(
  skill: SkillRecord,
  detailMode: "description" | "body" | "raw",
) {
  if (detailMode === "description") {
    return [
      `# ${skill.title}`,
      "",
      "## Description",
      "",
      skill.description || "No description available.",
    ].join("\n");
  }

  if (detailMode === "raw") {
    return [
      `# ${skill.title}`,
      "",
      "## Raw File",
      "",
      "```md",
      escapeCodeFence(skill.content),
      "```",
    ].join("\n");
  }

  const sections = buildReadableSections(skill.content);

  return [`# ${skill.title}`, "", ...sections].join("\n");
}

function buildReadableSections(content: string) {
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
  const lines = body.split("\n");
  const sections: string[] = [];

  if (lines.length === 0 || !body) {
    sections.push("## Instructions", "", "_No content_");
    return sections;
  }

  let currentHeading = "Instructions";
  let currentBlock: string[] = [];

  const flush = () => {
    if (currentBlock.length === 0) {
      return;
    }

    sections.push(`## ${currentHeading}`, "");
    sections.push(...renderParagraphs(currentBlock));
    sections.push("");
    currentBlock = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith("#")) {
      flush();
      currentHeading = line.trim().replace(/^#+\s*/, "") || "Section";
      continue;
    }

    currentBlock.push(line);
  }

  flush();
  return sections;
}

function renderParagraphs(lines: string[]) {
  const chunks: string[] = [];
  let paragraph: string[] = [];
  let codeBlock: string[] = [];
  let inCodeBlock = false;

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }

    chunks.push(paragraph.join("\n"));
    chunks.push("");
    paragraph = [];
  };

  const flushCodeBlock = () => {
    if (codeBlock.length === 0) {
      return;
    }

    chunks.push(...codeBlock);
    chunks.push("");
    codeBlock = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        codeBlock.push(line);
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        flushParagraph();
        inCodeBlock = true;
        codeBlock.push(line);
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlock.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  flushCodeBlock();

  if (chunks[chunks.length - 1] === "") {
    chunks.pop();
  }

  return chunks.length > 0 ? chunks : ["_No content_"];
}

function escapeCodeFence(value: string) {
  return value.replace(/```/g, "\\`\\`\\`");
}
