import { afterEach, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SettingsManager } from "../settings.js";

vi.mock("@anthropic-ai/claude-agent-sdk", async () => {
  const actual = await vi.importActual<any>("@anthropic-ai/claude-agent-sdk");
  return {
    ...actual,
    resolveSettings: (options: object) =>
      actual.resolveSettings({
        ...options,
        // Inject policy through the SDK's supported restrictive policy tier;
        // never create or change the host's managed settings.
        managedSettings: { permissions: { deny: ["Read"] } },
      }),
  };
});

afterEach(() => vi.unstubAllEnvs());

it("retains managed policy and watches only selected user and managed files", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "acp-settings-policy-"));
  vi.stubEnv("CLAUDE_CONFIG_DIR", home);
  const selected = path.join(home, "settings.json");
  fs.writeFileSync(selected, JSON.stringify({ permissions: { defaultMode: "default" } }));
  const project = path.join(home, "repo");
  fs.mkdirSync(path.join(project, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(project, ".claude/settings.json"),
    JSON.stringify({ permissions: { defaultMode: "plan" } }),
  );
  const manager = new SettingsManager(project, {
    settingSources: ["user"],
    requiredUserSettings: selected,
  });
  try {
    await manager.initialize();
    expect(manager.getSettings().permissions?.defaultMode).toBe("default");
    expect(manager.getSettings().permissions?.deny).toContain("Read");
    const watched: string[] = (manager as any).getWatchedPaths();
    expect(watched).toHaveLength(2);
    expect(watched).toContain(selected);
    expect(watched.some((file) => file.endsWith("managed-settings.json"))).toBe(true);
    await manager.setCwd(home);
    expect(manager.getSettings().permissions?.defaultMode).toBe("default");
    expect(manager.getSettings().permissions?.deny).toContain("Read");
    expect((manager as any).getWatchedPaths()).toEqual(watched);
  } finally {
    manager.dispose();
    fs.rmSync(home, { recursive: true, force: true });
  }
});
