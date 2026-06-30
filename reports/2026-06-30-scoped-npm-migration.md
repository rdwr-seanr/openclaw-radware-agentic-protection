# OpenClaw Scoped NPM Migration

## Summary

- Date: 2026-06-30
- New scoped package: `@radware/openclaw-radware-agentic-protection`
- Published customer version: `0.2.2`
- Legacy unscoped package: `openclaw-radware-agentic-protection`

## Completed

- Updated package identity to `@radware/openclaw-radware-agentic-protection`.
- Updated package and plugin version to `0.2.2`.
- Updated README, package README, focused docs, and generated DOCX/PDF guide to use the scoped package.
- Published `@radware/openclaw-radware-agentic-protection@0.2.2` with public access.
- Verified public npm resolution:
  - `npm view @radware/openclaw-radware-agentic-protection version` returns `0.2.2`.
  - `npx -y -p @radware/openclaw-radware-agentic-protection@latest radware-openclaw-setup --help` runs.
- Deprecated `@radware/openclaw-radware-agentic-protection@0.2.1` because it was superseded during the scoped migration.
- Deprecated all published legacy unscoped versions (`0.1.0` through `0.2.0`) with a migration message that points customers to `@radware/openclaw-radware-agentic-protection@latest`.

## Legacy Package

The legacy unscoped package remains available only as a migration pointer. It is deprecated, but not unpublished, so users with pinned installs receive the migration warning without breaking reproducible builds.

Do not unpublish or delete the legacy package as a normal maintenance action; keep it as a migration pointer for users with pinned installs.

## Verification

- `npm run check`: PASS
- `npm run test:plugin-decisions`: PASS
- `npm run smoke:plugin-hook`: PASS
- `npm run validate:fail-modes`: PASS
- `npm publish --dry-run --access public`: PASS
- `git diff --check`: PASS
- Repo token scan: PASS, no npm token found
- DOCX/PDF text check: PASS, scoped package and version `0.2.2` present, old NPM URL absent
- Legacy package deprecation check: PASS, `openclaw-radware-agentic-protection@0.1.0`, `@0.1.5`, and `@0.2.0` report the migration warning
