---
name: create-skills
description: Create or update workspace skills for webcode. Use when the user asks to create a skill, update a skill, turn a repeated workflow into a skill, summarize a process as SKILL.md, "create skill", "沉淀成 skill", "总结成 skill", "创建 skill", or add reusable workflow instructions under .agents/skills or .codex/skills.
---

# Create Skills

Create concise, reusable workspace skills that webcode can discover from `.agents/skills` or `.codex/skills`.

## Workflow

1. Clarify the skill target.
   - Identify the task the user wants to repeat.
   - Capture concrete trigger phrases and example requests.
   - Reuse the current conversation as examples when the user says to summarize the current flow.

2. Choose the workspace location.
   - Update an existing matching skill if one is already present.
   - Otherwise default to `.agents/skills/<skill-name>/SKILL.md` unless the user requests another discovered skills location.
   - Use lowercase letters, digits, and hyphens for `<skill-name>`.

3. Plan only useful bundled resources.
   - Keep simple skills to a single `SKILL.md`.
   - Add `references/` only for detailed text that should be loaded on demand.
   - Add `scripts/` only when deterministic repeated code is genuinely useful.
   - Do not create placeholder files or extra README-style documentation.

4. Write `SKILL.md`.
   - Include YAML frontmatter with only `name` and `description`.
   - Make `description` the trigger surface: include what the skill does and when to use it.
   - Keep the body procedural and compact, with instructions another agent can execute.
   - Link any optional resource files from the body and state when to read them.

5. Validate the result.
   - Check that `SKILL.md` exists at the skill root.
   - Check that frontmatter has valid `name` and `description` values.
   - If scripts were added, run a representative test.

6. Finish with next steps.
   - Tell the user the skill path.
   - Tell the user to re-run `/webcode` or `@webcode` in the AI page so the new skill appears in Available Skills.

## SKILL.md Pattern

Use this structure unless the existing skill has a stronger local convention:

```markdown
---
name: my-skill
description: Clear trigger-focused description of what this skill does and when to use it.
---

# My Skill

Follow this workflow when the skill triggers.

## Workflow

1. First concrete action.
2. Second concrete action.
3. Validation or finish criteria.
```

Prefer specific, task-local instructions over general agent advice. Keep reusable knowledge in the skill; keep one-off project notes out of it.
