import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resolveSettings, runAcp } = vi.hoisted(() => ({
  resolveSettings: vi.fn(),
  runAcp: vi.fn(),
}));

// Exercise startup without reading live settings or starting an ACP/SDK session.
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ resolveSettings }));
vi.mock("../acp-agent.js", () => ({ claudeCliPath: vi.fn() }));
// v0.95 starts ACP through serve.js; runAcp stands in for serveAcp.
vi.mock("../serve.js", () => ({ serveAcp: runAcp, acpProtocolsFromEnv: () => "auto" }));

describe("managed-policy env at startup", () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetModules();
    resolveSettings.mockReset();
    runAcp.mockReset();
    runAcp.mockReturnValue({ closed: new Promise(() => {}), dispose: vi.fn() });
    process.argv = [process.execPath, "index.js"];
    vi.stubEnv("CLAUDE_CODE_EXECUTABLE", undefined);
    vi.stubEnv("CRA1148_POLICY_TEST", "launch-value");
    vi.spyOn(process, "on").mockReturnValue(process);
    vi.spyOn(process.stdin, "resume").mockReturnValue(process.stdin);
    for (const method of ["log", "info", "warn", "debug", "error"] as const) {
      vi.spyOn(console, method).mockImplementation(() => {});
    }
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([
    ["/launch/claude", "/policy/claude"],
    ["/launch/claude", ""],
    ["", "/policy/claude"],
  ])(
    "rejects conflicting executable values (%j, %j) before applying policy or starting ACP",
    async (launch, policy) => {
      vi.stubEnv("CLAUDE_CODE_EXECUTABLE", launch);
      resolveSettings.mockResolvedValue({
        effective: {
          env: {
            CRA1148_POLICY_TEST: "policy-secret",
            CLAUDE_CODE_EXECUTABLE: policy,
          },
        },
      });
      const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);

      await expect(import("../index.js")).rejects.toThrow(
        new Error("Managed policy CLAUDE_CODE_EXECUTABLE conflicts with the launch environment."),
      );

      expect(resolveSettings).toHaveBeenCalledWith({ settingSources: [] });
      expect(runAcp).not.toHaveBeenCalled();
      expect(process.env.CLAUDE_CODE_EXECUTABLE).toBe(launch);
      expect(process.env.CRA1148_POLICY_TEST).toBe("launch-value");
      expect(stdout).not.toHaveBeenCalled();
      for (const method of ["log", "info", "warn", "debug", "error"] as const) {
        expect(console[method]).not.toHaveBeenCalled();
      }
    },
  );

  it.each(["/launch/claude", ""])(
    "allows matching executable %j and applies unrelated policy env",
    async (executable) => {
      vi.stubEnv("CLAUDE_CODE_EXECUTABLE", executable);
      resolveSettings.mockResolvedValue({
        effective: {
          env: { CLAUDE_CODE_EXECUTABLE: executable, CRA1148_POLICY_TEST: "policy-value" },
        },
      });
      runAcp.mockImplementation(() => {
        expect(process.env.CLAUDE_CODE_EXECUTABLE).toBe(executable);
        expect(process.env.CRA1148_POLICY_TEST).toBe("policy-value");
        return { closed: new Promise(() => {}), dispose: vi.fn() };
      });

      await import("../index.js");

      expect(runAcp).toHaveBeenCalledOnce();
    },
  );

  it("allows unrelated managed-policy env without replacing the launch executable", async () => {
    vi.stubEnv("CLAUDE_CODE_EXECUTABLE", "/launch/claude");
    resolveSettings.mockResolvedValue({
      effective: { env: { CRA1148_POLICY_TEST: "policy-value" } },
    });

    await import("../index.js");

    expect(process.env.CLAUDE_CODE_EXECUTABLE).toBe("/launch/claude");
    expect(process.env.CRA1148_POLICY_TEST).toBe("policy-value");
    expect(runAcp).toHaveBeenCalledOnce();
  });

  it.each(["/policy/claude", ""])(
    "preserves policy executable %j when launch env has no selection",
    async (executable) => {
      resolveSettings.mockResolvedValue({
        effective: {
          env: { CLAUDE_CODE_EXECUTABLE: executable, CRA1148_POLICY_TEST: "policy-value" },
        },
      });

      await import("../index.js");

      expect(process.env.CLAUDE_CODE_EXECUTABLE).toBe(executable);
      expect(process.env.CRA1148_POLICY_TEST).toBe("policy-value");
      expect(runAcp).toHaveBeenCalledOnce();
    },
  );

  it.each([undefined, "/launch/claude"])(
    "allows absent policy env with launch executable %j",
    async (executable) => {
      vi.stubEnv("CLAUDE_CODE_EXECUTABLE", executable);
      resolveSettings.mockResolvedValue({ effective: {} });

      await import("../index.js");

      expect(process.env.CLAUDE_CODE_EXECUTABLE).toBe(executable);
      expect(process.env.CRA1148_POLICY_TEST).toBe("launch-value");
      expect(runAcp).toHaveBeenCalledOnce();
    },
  );
});
