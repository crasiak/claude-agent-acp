import * as fs from "node:fs";
import * as path from "node:path";
import type { SettingSource } from "@anthropic-ai/claude-agent-sdk";

/** Opt-in trusted-launcher contract; not an authentication or sandbox boundary. */
export function protectedSettings(
  options?: Record<string, unknown>,
  env: Record<string, string | undefined> = process.env,
): { settingSources: SettingSource[]; settings: string; strictMcpConfig: true } | undefined {
  const scope = env.CLAUDE_ACP_SETTINGS_SCOPE;
  if (scope === undefined) return undefined;
  if (scope !== "user") throw new Error("CLAUDE_ACP_SETTINGS_SCOPE must be user");
  const home = env.CLAUDE_CONFIG_DIR;
  if (!home || !path.isAbsolute(home)) {
    throw new Error("Protected settings require an absolute CLAUDE_CONFIG_DIR");
  }
  const sources = options?.settingSources;
  if (
    sources !== undefined &&
    (!Array.isArray(sources) || sources.length !== 1 || sources[0] !== "user")
  ) {
    throw new Error("Session settingSources conflicts with protected user settings");
  }
  if (
    options?.env !== undefined ||
    options?.extraArgs !== undefined ||
    options?.strictMcpConfig === false
  ) {
    throw new Error("Session overrides conflict with protected user settings");
  }
  const settings = path.join(home, "settings.json");
  try {
    readSelectedUserSettings(settings);
    if (
      options?.settings !== undefined &&
      (typeof options.settings !== "string" ||
        !path.isAbsolute(options.settings) ||
        fs.realpathSync(options.settings) !== fs.realpathSync(settings))
    ) {
      throw new Error("different settings file");
    }
  } catch {
    throw new Error("Protected settings require the selected user settings file");
  }
  return { settingSources: ["user"], settings, strictMcpConfig: true };
}

/** The SDK resolver silently omits read/parse errors, so check our selected input. */
export function readSelectedUserSettings(settings: string): Record<string, unknown> {
  try {
    const stat = fs.statSync(settings);
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error("invalid file");
    const value: unknown = JSON.parse(fs.readFileSync(settings, "utf8"));
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not an object");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new Error("Cannot read valid selected user settings");
  }
}
