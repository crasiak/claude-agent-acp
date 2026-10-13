# ACP adapter for the Claude Agent SDK

[![npm](https://img.shields.io/npm/v/%40agentclientprotocol%2Fclaude-agent-acp)](https://www.npmjs.com/package/@agentclientprotocol/claude-agent-acp)

Use [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview#branding-guidelines) from [ACP-compatible](https://agentclientprotocol.com) clients!

This tool implements an ACP agent by using the official [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview), supporting:

- Context @-mentions
- Images
- Tool calls (with permission requests)
- Following
- Edit review
- TODO lists
- Nested subagent transcripts
- Interactive (and background) terminals
- Custom [Slash commands](https://docs.anthropic.com/en/docs/claude-code/slash-commands)
- Client MCP servers

Learn more about the [Agent Client Protocol](https://agentclientprotocol.com/).

### Nested subagent transcripts

ACP 1.2 has no standard subagent tool kind or nested-message relationship. Clients that can render
nested transcripts can opt in with `clientCapabilities._meta["subagent-transcript"] = true`.
The agent then forwards subagent text, thinking, and tool calls, relating nested updates to the
launching Agent/Task call through `_meta.claudeCode.parentToolUseId`. Agent/Task calls are marked
with `_meta.claudeCode.subagent = true`.

Clients that do not advertise the capability retain the legacy flattened behavior. In both modes,
the normal Agent/Task tool result is preserved as the protocol-compatible fallback.

## Protected user settings (CRA-955 fork)

Version `0.65.0-cra955.1` adds a transport-neutral, opt-in launcher contract:
`CLAUDE_ACP_SETTINGS_SCOPE=user`. When absent, existing behavior is unchanged.
When present, any value other than `user` is refused at session creation.

The launcher must set an absolute `CLAUDE_CONFIG_DIR` containing the selected
`settings.json`. Both the shim SettingsManager and SDK query use only the user
filesystem source; managed policy is still resolved by the SDK and is not
bypassed. The same selected file is passed to the SDK as `settings`, avoiding a
second caller-selected settings layer. New and load share this creation path.
Project/local settings do not influence the shim's permission/model defaults
or its settings-file watchers in this mode. The selected file must be a readable
JSON object of at most 2 MiB; nonempty content must survive SDK schema resolution
as the selected user source. Initial failure is an error, not an empty-settings
fallback. A rejected reload logs the failure and retains last-good shim settings.

Optional `_meta.claudeCode.options.settingSources` must be exactly `["user"]`.
An explicit `settings` option must resolve to the same selected user settings
file. Caller `env`, `extraArgs`, and `strictMcpConfig: false` are refused; strict
MCP is forced. The launcher/client still owns selected-plus-session MCP
composition and name-collision checks. This contract is not a malicious-client
sandbox, provider lock, native qualification or permission to bypass managed
policy. Native `policyHelper` behavior is outside the SDK's in-process settings
resolver and requires separate qualification.

Build and fake/unit verification (no native harness):

```sh
pnpm --ignore-workspace import
pnpm --ignore-workspace install --frozen-lockfile --ignore-scripts
pnpm --ignore-workspace exec vitest run src/tests/settings.test.ts src/tests/protected-settings.test.ts src/tests/acp-agent-settings.test.ts src/tests/settings-protected-lifecycle.test.ts
pnpm --ignore-workspace exec tsc
```

`package-lock.json` remains the upstream dependency lock; the local pnpm lock is
imported for verification. No installed package or native profile is updated by
these source changes.

## Contribution Policy

This project does not require a Contributor License Agreement (CLA). Instead, contributions are accepted under the following terms:

> By contributing to this project, you agree that your contributions will be licensed under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0). You affirm that you have the legal right to submit your work, that you are not including code you do not have rights to, and that you understand contributions are made without requiring a Contributor License Agreement (CLA).
