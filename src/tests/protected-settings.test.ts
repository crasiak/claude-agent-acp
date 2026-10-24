import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { protectedSettings } from "../protected-settings.js";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof fs>("node:fs");
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

describe("protected user settings", () => {
  let home: string;
  let env: Record<string, string | undefined>;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "acp-protected-settings-"));
    fs.writeFileSync(path.join(home, "settings.json"), "{}");
    env = { CLAUDE_CONFIG_DIR: home, CLAUDE_ACP_SETTINGS_SCOPE: "user" };
  });

  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it.each(["", "project", "user,project", "USER"])("refuses unknown scope %j", (scope) => {
    env.CLAUDE_ACP_SETTINGS_SCOPE = scope;
    expect(() => protectedSettings(undefined, env)).toThrow("CLAUDE_ACP_SETTINGS_SCOPE");
  });

  it.each([
    { settingSources: ["user", "project"] },
    { settingSources: [] },
    { settings: {} },
    { settings: "/not-selected/settings.json" },
    { env: { CLAUDE_CONFIG_DIR: "/not-selected" } },
    { extraArgs: { "setting-sources": "project" } },
    { strictMcpConfig: false },
  ])("refuses a competing session option %j", (options) => {
    expect(() => protectedSettings(options, env)).toThrow();
  });

  it("requires an explicit absolute selected home", () => {
    delete env.CLAUDE_CONFIG_DIR;
    expect(() => protectedSettings(undefined, env)).toThrow("CLAUDE_CONFIG_DIR");
    env.CLAUDE_CONFIG_DIR = "relative";
    expect(() => protectedSettings(undefined, env)).toThrow("CLAUDE_CONFIG_DIR");
  });

  it.each(["{", "[]", "null", '"settings"'])("refuses invalid selected settings %j", (text) => {
    fs.writeFileSync(path.join(home, "settings.json"), text);
    expect(() => protectedSettings(undefined, env)).toThrow("selected user settings");
  });

  it("refuses an unreadable selected file without leaking its contents", () => {
    const read = vi.spyOn(fs, "readFileSync").mockImplementationOnce(() => {
      throw new Error("EACCES: fixture-only detail");
    });
    try {
      expect(() => protectedSettings(undefined, env)).toThrow(
        /^Protected settings require the selected user settings file$/,
      );
    } finally {
      read.mockRestore();
    }
  });

  it("requires the selected settings to exist", () => {
    fs.unlinkSync(path.join(home, "settings.json"));
    expect(() => protectedSettings(undefined, env)).toThrow();
  });

  it("does not change the legacy metadata contract without opt-in", () => {
    delete env.CLAUDE_ACP_SETTINGS_SCOPE;
    expect(protectedSettings({ settingSources: ["project"] }, env)).toBeUndefined();
  });

  it("binds the manager and SDK to the selected user settings", () => {
    const settings = path.join(home, "settings.json");
    const options = { settingSources: ["user"], settings, strictMcpConfig: true };
    expect(protectedSettings(options, env)).toEqual({
      settingSources: ["user"],
      settings,
      strictMcpConfig: true,
    });
    expect(options).toEqual({ settingSources: ["user"], settings, strictMcpConfig: true });
  });

  it("accepts another path only when it resolves to the same settings file", () => {
    const alias = path.join(home, "selected.json");
    fs.symlinkSync(path.join(home, "settings.json"), alias);
    expect(protectedSettings({ settings: alias }, env)?.settings).toBe(
      path.join(home, "settings.json"),
    );
  });
});
