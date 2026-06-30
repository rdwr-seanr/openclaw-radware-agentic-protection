# Package Version Policy

Use `@radware/openclaw-radware-agentic-protection@latest` for customer deployments.

Version `0.2.2` is the scoped Radware package release. It includes:

- An existing OpenClaw config requirement by default.
- A strict choice of exactly one integration path per OpenClaw deployment.
- Rejection of `--in-path --out-of-path`.
- Rejection when adding one Radware path to a config that already contains the other Radware path.
- Clear guidance that `openclaw gateway run --force` is a foreground process and `gateway] ready` means startup succeeded.
- The interactive setup wizard, env-file writing, deterministic `npm:` plugin install guidance, full-stage out-of-path config, sanitized diagnostics, and custom in-path provider endpoint support.

The legacy unscoped package is `openclaw-radware-agentic-protection`. Keep it available as a migration pointer; do not delete it as a normal maintenance action. It has been deprecated with a migration message pointing customers to the scoped package.

## Scoped Package Migration

The scoped package has been published and verified:

```bash
npm view @radware/openclaw-radware-agentic-protection version
npx -y -p @radware/openclaw-radware-agentic-protection@latest radware-openclaw-setup --help
```

If additional old unscoped versions are ever published by mistake, deprecate them with the same migration message:

```bash
npm deprecate openclaw-radware-agentic-protection \
  "This package moved to @radware/openclaw-radware-agentic-protection. Please install @radware/openclaw-radware-agentic-protection@latest."
```

The deprecation command must be run from an npm account that owns or maintains the legacy unscoped package.

If a scoped migration version is superseded before customer use, deprecate only that version:

```bash
npm deprecate @radware/openclaw-radware-agentic-protection@0.2.1 \
  "Please use @radware/openclaw-radware-agentic-protection@0.2.2 or later."
```

## Do Not Unpublish Normal Superseded Versions

Do not unpublish previous NPM versions as a normal maintenance action. Unpublishing can break customers who pinned a version, and the unpublished version number cannot be reused.

Deprecation preserves reproducibility for pinned users while showing a clear install-time warning.

## When To Unpublish

Use unpublish only for exceptional cases, such as a legal issue, accidental secret exposure, or a malicious/broken package that must be removed. Prefer deprecation for normal product evolution.
