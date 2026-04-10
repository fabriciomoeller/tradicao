---
name: documentation
description: Skill for maintaining project documentation in the docs/ folder, ensuring naming conventions and README updates are followed.
---

# Documentation Skill

This skill provides instructions on how to handle documentation tasks for the BI EME4 project.

## Core Rules

1.  **File Location**: All documentation files must be stored in the `/docs` directory.
2.  **Naming Convention**: Every new documentation file must follow the format: `YYYY-MM-DD-HH-MM-SS-slug-name.md`.
    - Example: `2026-01-27-11-20-00-migracao-icones-unocss.md`
3.  **README Update**: Whenever a new documentation file is created, the master documentation file `/docs/README.md` must be updated.
    - Add a new row to the "Histórico de Implementações Detalhadas" table.
    - Use the format: `| DD/MM/YYYY HH:MM:SS | Title | [Ver Detalhes](filename.md) |`.
    - Update the "Atualizado em" timestamp at the bottom of the file.
4.  **Content Structure**: Documentation should include:
    - **Objetivo**: Why the change was made.
    - **Alterações Realizadas**: Technical details of the changes.
    - **Verificação Técnica**: A checklist of what was tested.
    - **Metadata**: Date, Status, and Type at the end.

## Workflow

1.  Identify the changes to be documented.
2.  Capture current date and time in `YYYY-MM-DD-HH-MM-SS` format.
3.  Create the markdown file in `docs/` with the appropriate prefix.
4.  If visual proof is needed, save images in `docs/assets/[feature-name]/` and reference them in the markdown.
5.  Edit `docs/README.md` to include the new record.
6.  Inform the user about the update.
