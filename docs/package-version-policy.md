# Package Version Policy

Use `openclaw-radware-agentic-protection@latest` for customer deployments.

Version `0.1.4` and later are the production-safe baseline. They include:

- An existing OpenClaw config requirement by default.
- A strict choice of exactly one integration path per OpenClaw deployment.
- Rejection of `--in-path --out-of-path`.
- Rejection when adding one Radware path to a config that already contains the other Radware path.
- Clear guidance that `openclaw gateway --force` is a foreground process and `gateway] ready` means startup succeeded.

## Do Not Unpublish Normal Superseded Versions

Do not unpublish previous NPM versions as a normal maintenance action. Unpublishing can break customers who pinned a version, and the unpublished version number cannot be reused.

If a previous version should no longer be used, deprecate it instead:

```bash
npm deprecate openclaw-radware-agentic-protection@"<0.1.4" \
  "Please upgrade to 0.1.4 or later. Earlier versions were superseded by production-safe OpenClaw deployment guidance and stricter in-path/out-of-path validation."
```

Deprecation preserves reproducibility for pinned users while showing a clear install-time warning.

## When To Unpublish

Use unpublish only for exceptional cases, such as a legal issue, accidental secret exposure, or a malicious/broken package that must be removed. Prefer deprecation for normal product evolution.
