# webcode Skills Guide

Language: English | [中文](SKILLS_GUIDE.md)

webcode can expose local Skills from the current VS Code workspace to the web AI. Skills are useful for project workflows, templates, domain notes, setup steps, or reusable script guidance.

## Scan Directories

webcode scans these directories under the primary workspace by default:

- `.agents/skills`
- `.codex/skills`

Any directory containing `SKILL.md` is treated as a Skill.

Example:

```text
.agents/
  skills/
    my-skill/
      SKILL.md
      references/
        examples.md
      templates/
        report.md
```

## Custom Scan Paths

Override the default scan paths with the VS Code setting `webcodeGateway.skillDirectories`.

Example:

```json
{
  "webcodeGateway.skillDirectories": [
    ".codex/skills",
    "docs/ai-skills"
  ]
}
```

Paths are resolved relative to the primary workspace root.
