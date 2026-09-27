import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { chmod, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { apiRoot, loadConfig } from "../src/config.ts";
import { buildUrl } from "../src/http.ts";
import { operations } from "../src/openapi.ts";
import { CliError } from "../src/errors.ts";
import { run, toEnvelope, type CommandSpec } from "../src/program.ts";

// Keep this file off the operator credential file. Config cases set their own path.
const missingConfigFile = join(tmpdir(), `dagu-cli-no-such-config-${process.pid}.json`);
process.env.DAGU_CONFIG_FILE = missingConfigFile;

const commands = JSON.parse(readFileSync(new URL("../spec/commands.json", import.meta.url), "utf8")) as CommandSpec[];
const execute = (argv: readonly string[]) =>
  Effect.runPromise(run(argv).pipe(Effect.catch((error) => Effect.succeed(toEnvelope(error instanceof CliError ? error : new CliError({ code: "INTERNAL", message: "Internal error.", retryable: false }))))));

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

  test("named query flags and the step-log stream default are sent", async () => {
    const seen: string[] = [];
    const original = globalThis.fetch;
    const previousKey = process.env.DAGU_API_KEY;
    const previousUrl = process.env.DAGU_BASE_URL;
    process.env.DAGU_API_KEY = "test-key";
    process.env.DAGU_BASE_URL = "http://127.0.0.1:8080";
    globalThis.fetch = (async (input: string | URL | Request) => {
      seen.push(String(input));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      const listed = await execute(["run", "list", "--limit", "5"]);
      const logged = await execute(["run", "step", "log", "demo", "run-1", "build"]);
      const streamed = await execute(["run", "step", "log", "demo", "run-1", "build", "--stream", "true"]);
      expect(listed.ok).toBe(true);
      expect(logged.ok).toBe(true);
      expect(streamed.ok).toBe(true);
      expect(seen[0]).toContain("limit=5");
      expect(seen[1]).toContain("stream=false");
      expect(seen[2]).toContain("stream=true");
    } finally {
      globalThis.fetch = original;
      if (previousKey === undefined) delete process.env.DAGU_API_KEY;
      else process.env.DAGU_API_KEY = previousKey;
      if (previousUrl === undefined) delete process.env.DAGU_BASE_URL;
      else process.env.DAGU_BASE_URL = previousUrl;
    }
  });

  test("an unknown filter names the accepted flags", async () => {
    const envelope = await execute(["dag", "search", "--limit", "1"]);
    expect(envelope.ok).toBe(false);
    expect(envelope.error?.message).toContain("--query");
    expect(envelope.error?.message).toContain("--q");
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

describe("config", () => {
  const previous = {
    key: process.env.DAGU_API_KEY,
    token: process.env.DAGU_API_TOKEN,
    url: process.env.DAGU_BASE_URL,
  };
  const restore = () => {
    const assign = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    assign("DAGU_API_KEY", previous.key);
    assign("DAGU_API_TOKEN", previous.token);
    assign("DAGU_BASE_URL", previous.url);
    process.env.DAGU_CONFIG_FILE = missingConfigFile;
  };

  test("private automation.json beats env, and --base-url beats the file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dagu-cli-config-"));
    const file = join(dir, "automation.json");
    await writeFile(file, JSON.stringify({ key: "file-key", baseUrl: "https://file.example" }));
    await chmod(file, 0o600);
    process.env.DAGU_CONFIG_FILE = file;
    process.env.DAGU_API_KEY = "env-key";
    process.env.DAGU_BASE_URL = "https://env.example";
    delete process.env.DAGU_API_TOKEN;
    try {
      const fromFile = await Effect.runPromise(loadConfig({}));
      expect(fromFile).toEqual({ baseUrl: "https://file.example/api/v1", apiKey: "file-key" });
      const fromFlag = await Effect.runPromise(loadConfig({ baseUrl: "https://flag.example" }));
      expect(fromFlag.baseUrl).toBe("https://flag.example/api/v1");
      expect(fromFlag.apiKey).toBe("file-key");
    } finally {
      restore();
    }
  });

  test("a missing file uses DAGU_API_TOKEN and the loopback default", async () => {
    process.env.DAGU_CONFIG_FILE = join(tmpdir(), `dagu-cli-absent-${process.pid}.json`);
    delete process.env.DAGU_API_KEY;
    delete process.env.DAGU_BASE_URL;
    process.env.DAGU_API_TOKEN = "token-alias";
    try {
      const config = await Effect.runPromise(loadConfig({}));
      expect(config).toEqual({ baseUrl: "http://127.0.0.1:8080/api/v1", apiKey: "token-alias" });
    } finally {
      restore();
    }
  });

  test("an unprivate or linked config file fails without echoing the key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dagu-cli-open-"));
    const file = join(dir, "automation.json");
    await writeFile(file, JSON.stringify({ key: "file-key" }));
    await chmod(file, 0o644);
    const link = join(dir, "link.json");
    await symlink(file, link);
    delete process.env.DAGU_API_KEY;
    delete process.env.DAGU_API_TOKEN;
    try {
      for (const path of [file, link]) {
        process.env.DAGU_CONFIG_FILE = path;
        const result = await Effect.runPromise(loadConfig({}).pipe(Effect.catch((cause) => Effect.succeed(cause))));
        expect(result).toBeInstanceOf(CliError);
        expect(JSON.stringify(result)).not.toContain("file-key");
      }
    } finally {
      restore();
    }
  });

  test("credentials and /mcp are rejected without copying them into the error", async () => {
    process.env.DAGU_CONFIG_FILE = missingConfigFile;
    process.env.DAGU_API_KEY = "env-key";
    try {
      for (const baseUrl of ["https://user:url-secret@dagu.example", "https://dagu.example/mcp"]) {
        const result = await Effect.runPromise(loadConfig({ baseUrl }).pipe(Effect.catch((cause) => Effect.succeed(cause))));
        expect(result).toBeInstanceOf(CliError);
        expect(JSON.stringify(result)).not.toContain("url-secret");
      }
    } finally {
      restore();
    }
  });
});

describe("params sugar", () => {
  const previous = { key: process.env.DAGU_API_KEY, url: process.env.DAGU_BASE_URL };
  const restoreEnv = () => {
    if (previous.key === undefined) delete process.env.DAGU_API_KEY;
    else process.env.DAGU_API_KEY = previous.key;
    if (previous.url === undefined) delete process.env.DAGU_BASE_URL;
    else process.env.DAGU_BASE_URL = previous.url;
  };

  const capture = async (argv: readonly string[]) => {
    const seen: { url: string; body: string | undefined }[] = [];
    const original = globalThis.fetch;
    process.env.DAGU_API_KEY = "test-key";
    process.env.DAGU_BASE_URL = "http://127.0.0.1:8080";
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(input), body: typeof init?.body === "string" ? init.body : undefined });
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const envelope = await execute(argv);
      return { envelope, seen };
    } finally {
      globalThis.fetch = original;
      restoreEnv();
    }
  };

  test("repeatable --param becomes a compact params string", async () => {
    const { envelope, seen } = await capture([
      "dag", "start", "herdr-settle",
      "--param", "agent_name=x",
      "--param", "webhook_url=https://example.test/hook",
      "--param", "agent_name=last",
    ]);
    expect(envelope.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("http://127.0.0.1:8080/api/v1/dags/herdr-settle/start");
    expect(seen[0]?.body).toBe('{"params":"{\\"agent_name\\":\\"last\\",\\"webhook_url\\":\\"https://example.test/hook\\"}"}');
  });

  test("--body siblings stay put and --param values are not coerced", async () => {
    const { envelope, seen } = await capture([
      "dag", "start", "herdr-settle",
      "--body", '{"singleton":true}',
      "--param", "id=007",
      "--param", "flag=true",
    ]);
    expect(envelope.ok).toBe(true);
    expect(seen[0]?.body).toBe('{"singleton":true,"params":"{\\"id\\":\\"007\\",\\"flag\\":\\"true\\"}"}');
  });

  test("a value may contain '=' and spaces, including an empty value", async () => {
    const { envelope, seen } = await capture([
      "dag", "start", "herdr-settle",
      "--param", "msg=hello world=x",
      "--param", "webhook_url=",
    ]);
    expect(envelope.ok).toBe(true);
    expect(seen[0]?.body).toBe('{"params":"{\\"msg\\":\\"hello world=x\\",\\"webhook_url\\":\\"\\"}"}');
  });

  test("params file is the base and a later --param string replaces that key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dagu-cli-params-"));
    const file = join(dir, "params.json");
    await writeFile(file, '{"age":30,"ok":true}');
    const { envelope, seen } = await capture(["dag", "start", "herdr-settle", "--params-file", file, "--param", "age=31"]);
    expect(envelope.ok).toBe(true);
    expect(JSON.parse(seen[0]?.body ?? "{}").params).toBe('{"age":"31","ok":true}');
  });

  test("an explicit empty params file still sends {}", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dagu-cli-params-empty-"));
    const file = join(dir, "empty.json");
    await writeFile(file, "{}");
    const sent = await capture(["dag", "start", "herdr-settle", "--params-file", file]);
    const omitted = await capture(["dag", "start", "herdr-settle"]);
    expect(sent.envelope.ok).toBe(true);
    expect(JSON.parse(sent.seen[0]?.body ?? "{}").params).toBe("{}");
    expect(omitted.envelope.ok).toBe(true);
    expect(omitted.seen[0]?.body).toBeUndefined();
  });

  test("enqueue, start sync, and spec runs get the same params string", async () => {
    const args = ["--param", "agent_name=x"] as const;
    const enqueue = await capture(["dag", "enqueue", "herdr-settle", ...args]);
    const sync = await capture(["dag", "start", "sync", "herdr-settle", ...args]);
    const startSpec = await capture(["run", "start", "spec", ...args]);
    const enqueueSpec = await capture(["run", "enqueue", "spec", ...args]);
    const params = '{"agent_name":"x"}';
    expect(enqueue.seen[0]?.url).toBe("http://127.0.0.1:8080/api/v1/dags/herdr-settle/enqueue");
    expect(sync.seen[0]?.url).toBe("http://127.0.0.1:8080/api/v1/dags/herdr-settle/start-sync");
    expect(startSpec.seen[0]?.url).toBe("http://127.0.0.1:8080/api/v1/dag-runs");
    expect(enqueueSpec.seen[0]?.url).toBe("http://127.0.0.1:8080/api/v1/dag-runs/enqueue");
    for (const item of [enqueue, sync, startSpec, enqueueSpec]) {
      expect(item.envelope.ok).toBe(true);
      expect(JSON.parse(item.seen[0]?.body ?? "{}").params).toBe(params);
    }
  });

  test("bad params files, a second file, the wrong command, a non-object body, and a pre-set params field do not fetch", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dagu-cli-params-bad-"));
    const nested = join(dir, "nested.json");
    const list = join(dir, "list.json");
    const ok = join(dir, "ok.json");
    const infinite = join(dir, "infinite.json");
    await writeFile(nested, '{"meta":{"a":1}}');
    await writeFile(list, "[]");
    await writeFile(ok, '{"age":30}');
    await writeFile(infinite, '{"n":1e309}');
    const cases = [
      ["dag", "start", "herdr-settle", "--params-file", nested],
      ["dag", "start", "herdr-settle", "--params-file", list],
      ["dag", "start", "herdr-settle", "--params-file", ok, "--params-file", ok],
      ["dag", "start", "herdr-settle", "--params-file", infinite],
      ["dag", "list", "--param", "agent_name=x"],
      ["dag", "start", "herdr-settle", "--body", '{"params":"{}"}', "--param", "agent_name=x"],
      ["dag", "start", "herdr-settle", "--body", "[]", "--param", "agent_name=x"],
      ["dag", "start", "herdr-settle", "--param", "bad key=secret-token"],
    ];
    for (const argv of cases) {
      const { envelope, seen } = await capture(argv);
      expect(envelope.ok).toBe(false);
      expect(envelope.error?.code).toBe("USAGE");
      expect(envelope.error?.message).not.toContain("Unknown flag");
      expect(seen).toHaveLength(0);
    }
    const nestedResult = await capture(["dag", "start", "herdr-settle", "--params-file", nested]);
    expect(nestedResult.envelope.error?.message).toContain(JSON.stringify("meta"));
    expect(nestedResult.envelope.error?.message).not.toContain('{"a":1}');
    const preset = await capture(["dag", "start", "herdr-settle", "--body", '{"params":"{}"}', "--param", "agent_name=x"]);
    expect(preset.envelope.error?.message).toContain("body.params is already set");
    const spaced = await capture(["dag", "start", "herdr-settle", "--param", "bad key=secret-token"]);
    expect(spaced.envelope.error?.message).toContain(JSON.stringify("bad key"));
    expect(spaced.envelope.error?.message).not.toContain("secret-token");
  });

  test("--params-file - reads a scalar object from stdin", async () => {
    const { Readable } = await import("node:stream");
    const original = process.stdin;
    const stream = Readable.from([Buffer.from('{"hook":"https://example.test/h"}')]);
    Object.defineProperty(stream, "isTTY", { value: false });
    Object.defineProperty(process, "stdin", { configurable: true, value: stream });
    try {
      const { envelope, seen } = await capture(["dag", "start", "herdr-settle", "--params-file", "-"]);
      expect(envelope.ok).toBe(true);
      expect(JSON.parse(seen[0]?.body ?? "{}").params).toBe('{"hook":"https://example.test/h"}');
    } finally {
      Object.defineProperty(process, "stdin", { configurable: true, value: original });
    }
  });

  test("leaf help documents the params sugar and other leaves do not", async () => {
    const start = await execute(["dag", "start", "--help"]);
    const list = await execute(["dag", "list", "--help"]);
    const sync = await execute(["dag", "start", "sync", "--help"]);
    const enqueue = await execute(["dag", "enqueue", "--help"]);
    const startSpec = await execute(["run", "start", "spec", "--help"]);
    const enqueueSpec = await execute(["run", "enqueue", "spec", "--help"]);
    const text = "Repeat --param key=value and/or pass --params-file <object.json>. Values are stringified into body.params. Other fields stay on --body.";
    for (const help of [start, sync, enqueue, startSpec, enqueueSpec]) {
      expect(help.ok).toBe(true);
      expect((help.result as { params?: string }).params).toBe(text);
    }
    expect(list.ok).toBe(true);
    expect(JSON.stringify(list.result)).not.toContain("--params-file");
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
