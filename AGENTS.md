# Repository Guidelines

## Project Structure & Module Organization

This workspace currently contains `報修需求筆記.txt`, the requirements for a small repair-reporting demonstration. No application code, tests, assets, dependency manifest, or Git metadata exists yet. Read the note before proposing implementation changes.

The planned deliverables are a submission form and report list, Supabase tables and access rules, an Excel field specification with sample data, a six-slide proposal, and a Word operating guide. When implementation begins, group application code, tests, database scripts, and documentation into clearly named directories such as `src/`, `tests/`, `supabase/`, and `docs/`.

## Build, Test, and Development Commands

No build, development, lint, or test commands are currently configured. Do not assume commands such as `npm test` work. After selecting a stack, document the exact installation, local startup, build, and validation commands here, matching the committed configuration.

For now, inspect the requirements with PowerShell:

```powershell
Get-Content -LiteralPath '報修需求筆記.txt' -Raw
```

## Coding Style & Naming Conventions

No formatter or linter has been selected. Follow the conventions of the chosen language and configure formatting when adding application code. Use descriptive names consistently and keep files focused on one responsibility. Preserve UTF-8 encoding and the Traditional Chinese field labels and option values defined in the requirements.

## Testing Guidelines

No testing framework or coverage threshold exists. Once code is added, cover report creation, required-field validation, category and urgency options, list rendering, and automatic registration timestamps. Verify Supabase policies allow insertion and reading while denying updates and deletion. Document the selected framework, test naming convention, and execution command alongside the tests.

## Commit & Pull Request Guidelines

There is no Git history from which to infer conventions. When version control is initialized, use concise, imperative commit subjects, for example `Add repair submission form`. Pull requests should describe the change, reference relevant requirements or issues, record validation results, and include screenshots for visible interface changes.

## Security & Scope

Use fictional names and locations only. Enable Supabase row-level security before exposing the public frontend key; never commit privileged keys. The current demo permits public insertion and reading only. Login, notifications, and status-update ownership remain undecided; clarify requirements before implementing those features.
