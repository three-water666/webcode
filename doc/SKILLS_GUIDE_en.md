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

Add extra scan paths with the VS Code setting `webcodeGateway.skillDirectories`.
This setting does not replace the defaults; configured paths are merged with the default directories and deduplicated.

Example:

```json
{
  "webcodeGateway.skillDirectories": [
    "docs/ai-skills"
  ]
}
```

Paths are resolved relative to the primary workspace root.
If you still need to scan the workspace-level `skills` directory, add `"skills"` explicitly to this list.
