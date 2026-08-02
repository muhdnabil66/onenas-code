# ONeNas Code by AtlasFlux

This repository is a private standalone mirror pinned to OpenCode Desktop
`v1.18.11` (`012c2f57f976489d88bd4598a056b4bdcdd428ee`). The public OpenCode
repository is configured as the `upstream` remote. Configure the private mirror
as `origin` before the first pilot release.

## Authority boundary

- `https://ai.atlasflux.my` is the only identity, model, credit, billing and
  policy authority.
- The desktop stores AtlasFlux access/refresh tokens with Electron
  `safeStorage` and uses PKCE through `onenas-code://auth/callback`.
- OpenCode's local sidecar still owns the workspace, terminal, permission model
  and local sessions.
- The managed provider bridge authorizes every run with AtlasFlux before opening
  an outbound WebSocket to `onenas-code-relay`.
- There is no pairing code and no bring-your-own-provider path.

## Packages

- `packages/desktop`: branded OpenCode Desktop and AtlasFlux auth/provider bridge.
- `packages/onenas-protocol`: ONeNas-only relay and safe-sync contracts. The
  upstream `packages/protocol` package remains unchanged.
- `services/relay`: Fly WebSocket data plane.
- `apps/site`: static distribution and documentation site for
  `onenas.atlasflux.my`.

## Required parent environment

```text
ONENAS_CODE_TOKEN_SECRET=<at least 32 random characters>
ONENAS_RELAY_JWT_SECRET=<same relay signing secret configured on Fly>
ONENAS_CODE_RELAY_URL=wss://onenas-code-relay.fly.dev/connect
ATLASFLUX_RELAY_SERVICE_TOKEN=<shared parent-to-relay service token>
OPENROUTER_API_KEY=<server-side only>
ONENAS_CODE_RUN_CREDITS=100
ONENAS_CODE_MINIMUM_VERSION=1.18.11
```

The Fly relay receives `ONENAS_RELAY_JWT_SECRET`,
`ATLASFLUX_RELAY_SERVICE_TOKEN`, and
`ATLASFLUX_PARENT_ORIGIN=https://ai.atlasflux.my`.

## Release gate

The Windows workflow intentionally fails when Azure Trusted Signing or GitHub
OIDC configuration is missing. Auto-update remains disabled until
`ONENAS_AUTO_UPDATE=1` is explicitly enabled after pilot acceptance.

OpenCode's MIT license is retained in `LICENSE`; additional attribution is in
`THIRD_PARTY_NOTICES.md`.
