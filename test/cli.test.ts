import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Effect } from "effect";
import { apiRoot } from "../src/config.ts";
import { buildUrl } from "../src/http.ts";
import { operations } from "../src/openapi.ts";
import { run, type CommandSpec } from "../src/program.ts";

const commands = JSON.parse(readFileSync(new URL("../spec/commands.json", import.meta.url), "utf8")) as CommandSpec[];
const execute = (argv: readonly string[]) => Effect.runPromise(run(argv));

describe("command tree", () => {
  test("covers every OpenAPI operation exactly once", async () => {
    const ids = new Set((await Effect.runPromise(operations)).map((operation) => operation.operationId));
    const mapped = commands.map((command) => command.operationId);
    expect(new Set(mapped).size).toBe(mapped.length);
    expect(new Set(mapped)).toEqual(ids);
    expect(commands).toHaveLength(227);
  });

  test("root help exposes nouns, not operation ids", async () => {
    const help = await execute([]);
    const names = ((help.result as { commands: { command: string }[] }).commands).map((item) => item.command);
    expect(names).toContain("dag");
    expect(names).toContain("run");
    expect(names).toContain("admin");
    expect(JSON.stringify(help)).not.toContain("ListDAGs");
    expect(names).not.toContain("operations");
  });

  test("skills split daily commands from admin", async () => {
    const core = await execute(["skills", "get", "core"]);
    const admin = await execute(["skills", "get", "admin"]);
    const coreText = JSON.stringify(core.result);
    const adminText = JSON.stringify(admin.result);
    expect(coreText).toContain("dagu-cli dag list");
    expect(coreText).toContain("dagu-cli run get <name> <dagRunId>");
    expect(coreText).not.toContain("api-key create");
    expect(adminText).toContain("dagu-cli admin api-key create");
  });

  test("dag start sends the file name on the path", async () => {
    const seen: string[] = [];
    const original = globalThis.fetch;
    const previousKey = process.env.DAGU_API_KEY;
    const previousUrl = process.env.DAGU_BASE_URL;
    process.env.DAGU_API_KEY = "test-key";
    process.env.DAGU_BASE_URL = "http://127.0.0.1:8080";
    globalThis.fetch = (async (input: string | URL | Request) => {
      seen.push(String(input));
      return new Response(JSON.stringify({ dagRunId: "run-1" }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const envelope = await execute(["dag", "start", "demo.yaml", "--body", "{\"params\":\"{}\"}"]);
      expect(envelope.ok).toBe(true);
      expect(envelope.command).toBe("dag start");
      expect(seen[0]).toBe("http://127.0.0.1:8080/api/v1/dags/demo.yaml/start");
    } finally {
      globalThis.fetch = original;
      if (previousKey === undefined) delete process.env.DAGU_API_KEY;
      else process.env.DAGU_API_KEY = previousKey;
      if (previousUrl === undefined) delete process.env.DAGU_BASE_URL;
      else process.env.DAGU_BASE_URL = previousUrl;
    }
  });

  test("webhook trigger uses the webhook token instead of the API key", async () => {
    let authorization = "";
    const original = globalThis.fetch;
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const previous = process.env.DAGU_API_KEY;
    delete process.env.DAGU_API_KEY;
    try {
      const envelope = await execute(["webhook", "trigger", "demo.yaml", "--token", "hook-secret"]);
      expect(envelope.ok).toBe(true);
      expect(authorization).toBe("Bearer hook-secret");
      expect(JSON.stringify(envelope)).not.toContain("hook-secret");
    } finally {
      globalThis.fetch = original;
      if (previous) process.env.DAGU_API_KEY = previous;
    }
  });
});

describe("url", () => {
  test("joins the API root and encodes path values", () => {
    expect(apiRoot("https://dagu.example")).toBe("https://dagu.example/api/v1");
    const operation = {
      operationId: "GetDAGDetails",
      method: "GET" as const,
      path: "/dags/{fileName}",
      tag: "dags",
      summary: "",
      parameters: [{ name: "fileName", location: "path" as const, required: true, description: "" }],
      bodyProperties: [],
      bodyRequired: false,
    };
    expect(buildUrl({ baseUrl: "https://dagu.example", operation, path: { fileName: "a b.yaml" }, query: { remoteNode: "worker-1" } })).toBe(
      "https://dagu.example/api/v1/dags/a%20b.yaml?remoteNode=worker-1",
    );
  });
});
