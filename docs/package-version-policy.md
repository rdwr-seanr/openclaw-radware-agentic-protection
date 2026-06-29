# Package Version Policy

Use `openclaw-radware-agentic-protection@latest` for customer deployments.

Version `0.2.0` is the customer release version. It includes:

- An existing OpenClaw config requirement by default.
- A strict choice of exactly one integration path per OpenClaw deployment.
- Rejection of `--in-path --out-of-path`.
- Rejection when adding one Radware path to a config that already contains the other Radware path.
- Clear guidance that `openclaw gateway run --force` is a foreground process and `gateway] ready` means startup succeeded.
- The interactive setup wizard, env-file writing, deterministic `npm:` plugin install guidance, full-stage out-of-path config, and sanitized diagnostics.

Release validation has been completed. Publish `0.2.0` only from an authenticated NPM session and tag the matching Git commit as `v0.2.0`.

## Do Not Unpublish Normal Superseded Versions

Do not unpublish previous NPM versions as a normal maintenance action. Unpublishing can break customers who pinned a version, and the unpublished version number cannot be reused.

If a previous version should no longer be used, deprecate it instead:

```bash
npm deprecate openclaw-radware-agentic-protection@"<0.2.0" \
  "Please upgrade to 0.2.0 or later. Earlier versions were superseded by the interactive setup wizard, full-stage out-of-path enforcement, diagnostics, and stricter in-path/out-of-path validation."
```

Deprecation preserves reproducibility for pinned users while showing a clear install-time warning.

## When To Unpublish

Use unpublish only for exceptional cases, such as a legal issue, accidental secret exposure, or a malicious/broken package that must be removed. Prefer deprecation for normal product evolution.
