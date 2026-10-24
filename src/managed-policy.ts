import { resolveSettings } from "@anthropic-ai/claude-agent-sdk";

/**
 * Applies the managed-policy tier's env vars to `process.env` before any SDK
 * call, so the SDK subprocess inherits them. Going through `resolveSettings`
 * rather than a raw read of `managed-settings.json` also picks up MDM sources on
 * macOS and `HKLM`/`HKCU` on Windows.
 *
 * Reading the tier is best-effort by nature: on a host with no MDM and no
 * managed policy the result is empty and the agent behaves identically. So a
 * transient failure to read it — `EINTR`, `EMFILE`, `EAGAIN` — must leave the
 * agent running with no policy env rather than stop it from starting.
 *
 * That guard matters because the caller awaits this at module scope in an ESM
 * entry point, where a rejection aborts module evaluation and the process exits
 * before serving any ACP traffic. `SettingsManager.loadAllSettings` wraps the
 * same SDK call for the same reason.
 */
export async function applyManagedPolicyEnv(
  resolve: typeof resolveSettings = resolveSettings,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  let policy: Awaited<ReturnType<typeof resolveSettings>>;
  try {
    policy = await resolve({ settingSources: [] });
  } catch (error) {
    // stderr, so the ACP stream on stdout stays clean.
    console.error("Failed to resolve managed policy settings:", error);
    return;
  }
  // A launcher that selected the Claude executable must not have it
  // replaced by managed policy (CRA-1148). Checked after the best-effort read
  // and before any policy env is applied, and outside the read's catch, so a
  // conflict fails startup closed. Neither value is included in the error:
  // policy env can carry sensitive values.
  const launchExecutable = env.CLAUDE_CODE_EXECUTABLE;
  const policyExecutable = policy.effective.env?.CLAUDE_CODE_EXECUTABLE;
  if (
    launchExecutable !== undefined &&
    policyExecutable !== undefined &&
    policyExecutable !== launchExecutable
  ) {
    throw new Error("Managed policy CLAUDE_CODE_EXECUTABLE conflicts with the launch environment.");
  }
  for (const [key, value] of Object.entries(policy.effective.env ?? {})) {
    env[key] = value;
  }
}
