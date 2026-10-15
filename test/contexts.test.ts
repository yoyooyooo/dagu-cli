import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Envelope } from "../src/program.ts";

const cli = new URL("../src/cli.ts", import.meta.url).pathname;
const secret = (): string => randomBytes(24).toString("hex");

const fixture = async () => {
  const home = await mkdtemp(join(tmpdir(), "dagu-cli-contexts-"));
  const file = join(home, ".config/dagu-cli/contexts.json");
  const legacy = join(home, "automation.json");
  const env = { HOME: home, DAGU_CONFIG_FILE: legacy };
  const invoke = async (args: string[], extra: Record<string, string> = {}) => {
    const proc = Bun.spawn([process.execPath, cli, ...args], { env: { ...env, ...extra }, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    // Never include credential values in assertion diagnostics, even on failure.
    expect(stderr.length === 0).toBe(true);
    return { envelope: JSON.parse(stdout) as Envelope, text: stdout + stderr, code };
  };
  const store = async (target: string, value: unknown) => {
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, JSON.stringify(value), { mode: 0o600 });
  };
  const keyFile = async (key = secret()) => {
    const path = join(home, `key-${randomBytes(8).toString("hex")}`);
    await writeFile(path, `${key}\n`, { mode: 0o600 });
    return path;
  };
  const add = async (name: string, baseUrl: string, key = secret()) => {
    const path = await keyFile(key);
    const result = await invoke(["context", "add", name, "--base-url", baseUrl, "--api-key-file", path]);
    expect(result.code).toBe(0);
    expect(result.text.includes(key)).toBe(false);
    return path;
  };
  return { home, file, legacy, invoke, store, keyFile, add };
};

describe("connection contexts through the CLI entry point", () => {
  test("ls/add/show/use/rm use one 0600 file, store references only, and never touch key files", async () => {
    const f = await fixture();
    const key = secret();
    expect((await f.invoke(["context", "ls"])).envelope.result).toEqual({ contexts: [], currentContext: null });
    let keyFile = "";
    for (const name of ["local", "box", "mini", "pro", "imile-win"]) {
      const path = await f.add(name, "https://dagu.example", key);
      if (name === "mini") keyFile = path;
    }
    expect((await lstat(f.file)).mode & 0o777).toBe(0o600);
    const text = await readFile(f.file, "utf8");
    expect(text.includes(key)).toBe(false);
    const stored = JSON.parse(text);
    expect(Object.values(stored.contexts).every((value) => typeof (value as { apiKeyFile: string }).apiKeyFile === "string")).toBe(true);
    expect((await f.invoke(["context", "use", "mini"])).code).toBe(0);
    expect((await f.invoke(["context", "ls"])).envelope.result).toEqual({ contexts: ["box", "imile-win", "local", "mini", "pro"], currentContext: "mini" });
    for (const args of [["context", "show"], ["context", "show", "mini"], ["-c", "mini", "context", "show"]]) {
      const shown = await f.invoke(args);
      expect(shown.code).toBe(0);
      expect((shown.envelope.result as { apiKey: string }).apiKey).toBe("[redacted]");
      expect(shown.text.includes(key) || shown.text.includes(keyFile)).toBe(false);
    }
    expect((await f.invoke(["context", "rm", "mini"])).code).toBe(2);
    expect((await f.invoke(["context", "use", "-"])).code).toBe(0);
    expect((await f.invoke(["context", "rm", "mini"])).code).toBe(0);
    expect((await f.invoke(["context", "ls"])).envelope.result).toEqual({ contexts: ["box", "imile-win", "local", "pro"], currentContext: null });
    expect((await readFile(keyFile, "utf8")).trim() === key).toBe(true);
    await f.add("mini", "https://again.example");
  });

  test("base-url > context flag/-c > DAGU_CONTEXT > current > env > legacy, including derived commands", async () => {
    const f = await fixture();
    const key = secret();
    const accepted: boolean[] = [];
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(req) {
      accepted.push(req.headers.get("authorization") === `Bearer ${key}`);
      return Response.json({ dag: { name: "demo", paramDefs: [] } });
    } });
    try {
      await f.add("mini", server.url.origin, key);
      await f.add("box", "http://127.0.0.1:1");
      await f.add("pro", "http://127.0.0.1:2");
      expect((await f.invoke(["context", "use", "pro"])).code).toBe(0);
      await f.store(f.legacy, { baseUrl: "http://127.0.0.1:3", key: secret() });
      const env = { DAGU_CONTEXT: "box", DAGU_BASE_URL: "http://127.0.0.1:4", DAGU_API_KEY: secret() };
      for (const args of [["--context", "mini", "dag", "list"], ["dag", "list", "-c", "mini"], ["-c", "mini", "dag", "list"], ["dag", "params", "demo", "--context=mini"]]) {
        expect((await f.invoke(args, env)).code).toBe(0);
      }
      expect((await f.invoke(["dag", "list"], { ...env, DAGU_CONTEXT: "mini" })).code).toBe(0);
      expect((await f.invoke(["context", "use", "mini"])).code).toBe(0);
      expect((await f.invoke(["dag", "list"], { DAGU_BASE_URL: env.DAGU_BASE_URL, DAGU_API_KEY: env.DAGU_API_KEY })).code).toBe(0);
      await f.add("override", "http://127.0.0.1:5", key);
      expect((await f.invoke(["--context", "override", "dag", "list", "--base-url", server.url.origin])).code).toBe(0);
      expect(accepted.length).toBe(7);
      expect(accepted.every(Boolean)).toBe(true);
    } finally { server.stop(true); }
  });

  test("environment connections beat the legacy file, which remains a field-by-field fallback", async () => {
    const f = await fixture();
    const fileKey = secret();
    const envKey = secret();
    let expected = envKey;
    const accepted: boolean[] = [];
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(req) {
      accepted.push(req.headers.get("authorization") === `Bearer ${expected}`);
      return Response.json({});
    } });
    try {
      await f.store(f.legacy, { baseUrl: "http://127.0.0.1:1", key: fileKey });
      expect((await f.invoke(["dag", "list"], { DAGU_BASE_URL: server.url.origin, DAGU_API_KEY: envKey })).code).toBe(0);
      expect((await f.invoke(["dag", "list"], { DAGU_BASE_URL: server.url.origin, DAGU_API_TOKEN: envKey })).code).toBe(0);
      expected = fileKey;
      expect((await f.invoke(["dag", "list"], { DAGU_BASE_URL: server.url.origin })).code).toBe(0);
      await f.store(f.legacy, { baseUrl: server.url.origin, apiKey: fileKey });
      expect((await f.invoke(["dag", "list"])).code).toBe(0);
      // Complete env connections need not open an unsafe legacy fallback file.
      await chmod(f.legacy, 0o644);
      expected = envKey;
      expect((await f.invoke(["dag", "list"], { DAGU_BASE_URL: server.url.origin, DAGU_API_KEY: envKey })).code).toBe(0);
      expect(accepted.length).toBe(5);
      expect(accepted.every(Boolean)).toBe(true);
    } finally { server.stop(true); }
  });

  test("unknown contexts and invalid names fail without fallback or disclosure of env values", async () => {
    const f = await fixture();
    const env = { DAGU_CONTEXT: "../private-env-name", DAGU_BASE_URL: "https://private-env.example", DAGU_API_KEY: secret() };
    for (const args of [["dag", "list"], ["context", "show"]]) {
      const result = await f.invoke(args, env);
      expect(result.code).toBe(2);
      expect(Object.values(env).some((value) => result.text.includes(value))).toBe(false);
    }
    for (const name of ["missing", "..", "/absolute", "a/b", "a\\b", ".hidden", " ", "constructor", "__proto__"]) {
      const result = await f.invoke(["--context", name, "dag", "list"], { DAGU_API_KEY: env.DAGU_API_KEY });
      expect(result.code).toBe(2);
      expect(result.text.includes(env.DAGU_API_KEY)).toBe(false);
    }
    await f.store(f.file, { currentContext: "missing", contexts: {} });
    expect((await f.invoke(["dag", "list"], { DAGU_API_KEY: secret() })).code).toBe(2);
    const shown = await f.invoke(["context", "show"], { DAGU_BASE_URL: env.DAGU_BASE_URL, DAGU_API_KEY: env.DAGU_API_KEY });
    expect(Object.values(env).some((value) => shown.text.includes(value))).toBe(false);
  });

  test("malformed schemas, inline keys, unsafe modes, symlinks, and absent/empty key files fail closed", async () => {
    const f = await fixture();
    const key = secret();
    const keyFile = await f.keyFile(key);
    for (const value of [null, [], {}, { currentContext: 42, contexts: {} }, { contexts: [] }, { contexts: { mini: null } }, ...[
      { baseUrl: 2, apiKeyFile: keyFile }, { baseUrl: "https://dagu.example" }, { baseUrl: "https://dagu.example", apiKey: key },
      { baseUrl: "https://dagu.example", apiKeyFile: keyFile, key }, { baseUrl: `https://u:${key}@dagu.example`, apiKeyFile: keyFile },
      { baseUrl: `https://dagu.example?key=${key}`, apiKeyFile: keyFile }, { baseUrl: "file:///private", apiKeyFile: keyFile },
    ].map((mini) => ({ contexts: { mini } }))]) {
      await f.store(f.file, value);
      const result = await f.invoke(["--context", "mini", "dag", "list"]);
      expect(result.code).toBe(2);
      expect(result.text.includes(key)).toBe(false);
    }
    const configuration = (path: string) => ({ contexts: { mini: { baseUrl: "https://dagu.example", apiKeyFile: path } } });
    await f.store(f.file, configuration(keyFile));
    await chmod(f.file, 0o644);
    expect((await f.invoke(["--context", "mini", "dag", "list"])).code).toBe(2);
    await chmod(f.file, 0o600);
    await chmod(keyFile, 0o644);
    expect((await f.invoke(["context", "show", "mini"])).code).toBe(0);
    expect((await f.invoke(["--context", "mini", "dag", "list"])).code).toBe(2);
    await chmod(keyFile, 0o600);
    const linkedKey = join(f.home, "linked-key");
    await symlink(keyFile, linkedKey);
    await f.store(f.file, configuration(linkedKey));
    expect((await f.invoke(["--context", "mini", "dag", "list"])).code).toBe(2);
    await f.store(f.file, configuration(join(f.home, "missing-key")));
    expect((await f.invoke(["--context", "mini", "dag", "list"], { DAGU_API_KEY: key })).code).toBe(2);
    await writeFile(keyFile, " ");
    await f.store(f.file, configuration(keyFile));
    expect((await f.invoke(["--context", "mini", "dag", "list"])).code).toBe(2);
    const other = await fixture();
    await mkdir(dirname(other.file), { recursive: true, mode: 0o700 });
    await symlink(f.file, other.file);
    expect((await other.invoke(["context", "ls"])).code).toBe(2);
    expect((await other.invoke(["context", "use", "-"])).code).toBe(2);
  });

  test("relative key references resolve against contexts.json; reflected keys and transport errors stay private", async () => {
    const f = await fixture();
    const key = secret();
    let status = 200;
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(req) {
      return Response.json({ echo: req.headers.get("authorization"), nested: [key], [key]: "echo" }, { status });
    } });
    try {
      await f.store(f.file, { contexts: { mini: { baseUrl: server.url.origin, apiKeyFile: "key" } } });
      await writeFile(join(dirname(f.file), "key"), `${key}\n`, { mode: 0o600 });
      for (const code of [200, 401]) {
        status = code;
        const result = await f.invoke(["-c", "mini", "dag", "list"]);
        expect(result.code).toBe(code === 200 ? 0 : 1);
        expect(result.text.includes(key)).toBe(false);
        expect(result.text.includes("[redacted]")).toBe(true);
      }
      const failed = await f.invoke(["-c", "mini", "dag", "list", "--base-url", "http://127.0.0.1:1"]);
      expect(failed.code).toBe(1);
      expect(failed.text.includes(key) || failed.text.includes("127.0.0.1")).toBe(false);
    } finally { server.stop(true); }
  });

  test("runtime profile API and webhook --profile preserve their original wire behavior and never select contexts", async () => {
    const f = await fixture();
    const key = secret();
    const hook = secret();
    const seen: { path: string; authorized: boolean; runtime: string | null }[] = [];
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(req) {
      const path = new URL(req.url).pathname;
      seen.push({ path, authorized: req.headers.get("authorization") === `Bearer ${path.includes("webhooks") ? hook : key}`, runtime: req.headers.get("x-dagu-profile") });
      return Response.json({});
    } });
    try {
      await f.add("mini", server.url.origin, key);
      await f.add("X", "http://127.0.0.1:1");
      expect((await f.invoke(["context", "use", "mini"])).code).toBe(0);
      expect((await f.invoke(["--context", "mini", "profile", "list"])).code).toBe(0);
      for (const args of [
        ["--context", "mini", "webhook", "trigger", "demo", "--token", hook, "--profile", "X"],
        ["webhook", "trigger", "demo", "--token", hook, "--profile", "X"],
      ]) expect((await f.invoke(args)).code).toBe(0);
      expect((await f.invoke(["context", "use", "-"])).code).toBe(0);
      expect((await f.invoke(["webhook", "trigger", "demo", "--token", hook, "--profile", "X"], { DAGU_BASE_URL: server.url.origin })).code).toBe(0);
      expect((await f.invoke(["webhook", "trigger", "demo", "--token", hook, "--profile", "-c"], { DAGU_BASE_URL: server.url.origin })).code).toBe(0);
      expect((await f.invoke(["dag", "list", "--profile", "X"], { DAGU_BASE_URL: server.url.origin, DAGU_API_KEY: key })).code).toBe(0);
      expect(seen.map((entry) => ({ path: entry.path, runtime: entry.runtime }))).toEqual([
        { path: "/api/v1/profiles", runtime: null },
        { path: "/api/v1/webhooks/demo", runtime: "X" },
        { path: "/api/v1/webhooks/demo", runtime: "X" },
        { path: "/api/v1/webhooks/demo", runtime: "X" },
        { path: "/api/v1/webhooks/demo", runtime: "-c" },
        { path: "/api/v1/dags", runtime: null },
      ]);
      expect(seen.every((entry) => entry.authorized)).toBe(true);
      const commands = JSON.parse(await readFile(new URL("../spec/commands.json", import.meta.url), "utf8"));
      expect(commands.filter((command: { argv: string[] }) => command.argv[0] === "profile").length).toBe(18);
    } finally { server.stop(true); }
  });

  test("context help is discoverable; bad arguments fail without echoing a supplied literal key", async () => {
    const f = await fixture();
    for (const args of [[], ["--context", "mini", "dag", "list", "--help"], ["dag", "list", "-c", "mini", "--help"], ["context", "--help"], ["context", "add", "--help"], ["-c", "mini", "skills", "get", "core"]]) {
      expect((await f.invoke(args)).code).toBe(0);
    }
    const key = secret();
    for (const args of [["--context"], ["-c"], ["--context="], ["-c", "a", "--context", "b", "dag", "list"], ["context", "use", "missing"], ["context", "show"], ["context", "ls", "extra"], ["context", "rm", "missing"], ["context", "add", "mini", "--api-key", key], ["context", "add", "mini", "--base-url", "https://dagu.example"], ["context", "add", "mini", "--base-url", "https://dagu.example", "--api-key-file", "missing"]]) {
      const result = await f.invoke(args);
      expect(result.code).toBe(2);
      expect(result.text.includes(key)).toBe(false);
    }
    await f.add("mini", "https://dagu.example");
    expect((await f.invoke(["context", "add", "mini", "--base-url", "https://dagu.example"])).code).toBe(2);
  });
});
