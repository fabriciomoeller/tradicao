---
name: git
description: Skill for standardizing the commit process using documentation titles as commit messages.
---

# Git Skill

This skill defines the standard workflow for committing changes in the Tradicao project.

## Workflow

1.  **Approval**: Ensure the task has been implemented and approved by the user.
2.  **Documentation**: Ensure a documentation file has been created in the `docs/` folder following the `documentation` skill.
3.  **Identify Title**: Open the documentation file created for the current task and identify its title (the first `#` header).
4.  **Stage Changes**: Run `git add .` to stage all changes.
5.  **Commit**: Run the commit command using the identified title as the message.
    - `git commit -m "Título do Documento"`

## Rules

- Never commit without a corresponding documentation file in `docs/`.
- The commit message must exactly match the title found in the markdown document (H1).
