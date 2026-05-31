# webcode Skills 使用指南

语言：中文 | [English](SKILLS_GUIDE_en.md)

webcode 可以把当前 VS Code 工作区中的本地 Skills 暴露给网页 AI。Skill 适合放置项目工作流、模板、领域说明、安装步骤或可复用脚本说明。

## 扫描目录

默认扫描当前主工作区下的这些目录：

- `.agents/skills`
- `.codex/skills`

只要目录里包含 `SKILL.md`，就会被视为一个 Skill。

示例结构：

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

## 自定义扫描路径

可以通过 VS Code 配置项 `webcodeGateway.skillDirectories` 添加额外扫描路径。
该配置不会替代默认目录；配置路径会和默认目录合并并去重。

示例：

```json
{
  "webcodeGateway.skillDirectories": [
    "docs/ai-skills"
  ]
}
```

路径相对于当前主工作区根目录解析。
如果仍需要扫描工作区顶层 `skills`，可以把 `"skills"` 显式加入这个列表。
