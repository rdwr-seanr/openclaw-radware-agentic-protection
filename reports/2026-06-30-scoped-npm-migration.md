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

## Not Completed

The legacy unscoped package was not deprecated because npm rejected the Radware scoped account as a non-owner:

```text
You do not have permission to publish "openclaw-radware-agentic-protection".
```

To complete the migration, add the Radware npm user as a maintainer of `openclaw-radware-agentic-protection` or run the deprecation from an npm account that already owns that package:

```bash
npm deprecate openclaw-radware-agentic-protection \
  "This package moved to @radware/openclaw-radware-agentic-protection. Please install @radware/openclaw-radware-agentic-protection@latest."
```

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
