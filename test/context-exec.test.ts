import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Envelope } from "../src/program.ts";

const cli = new URL("../src/cli.ts", import.meta.url).pathname;
type Report = { summary: { total: number; success: number; failed: number; timeout: number }; results: { context: string; outcome: string; response: Envelope }[] };
const fixture = async (urls: Record<string, string>) => {
  const home = await mkdtemp(join(tmpdir(), "dagu-context-exec-"));
  const dir = join(home, ".config/dagu-cli");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(join(dir, "key"), "fixture-secret", { mode: 0o600 });
  const file = join(dir, "contexts.json");
  await writeFile(file, JSON.stringify({ currentContext: "absent", contexts: Object.fromEntries(Object.entries(urls).map(([name, baseUrl]) => [name, { baseUrl, apiKeyFile: "key", labels: { group: "test" } }])) }), { mode: 0o600 });
  const invoke = async (args: string[]) => {
    const p = Bun.spawn([process.execPath, cli, ...args], { env: { HOME: home, DAGU_CONTEXT: "absent", DAGU_BASE_URL: "http://bad.invalid", DAGU_API_KEY: "wrong-env-secret" }, stdout: "pipe", stderr: "pipe" });
    const [text, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    expect(stderr).toBe("");
    expect(text.includes("fixture-secret")).toBe(false);
    return { code, envelope: JSON.parse(text) as Envelope };
  };
  return { invoke, file };
};
const exec = (...options: string[]) => ["context", "exec", "--selector", "group=test", ...options, "--", "dag", "list", "--perPage", "2"];

describe("context exec through real CLI subprocesses", () => {
  test("parallel AND-selected targets share one command, collect HTTP errors and timeouts without sibling cancellation", async () => {
    let active = 0;
    let peak = 0;
    const requests: string[] = [];
    const servers = [0, 1, 2].map((index) => Bun.serve({ port: 0, async fetch(request) {
      active++; peak = Math.max(active, peak);
      requests.push(`${index}:${new URL(request.url).pathname}${new URL(request.url).search}`);
      expect(request.method).toBe("GET");
      expect(request.headers.get("authorization") === "Bearer fixture-secret").toBe(true);
      try {
        await Bun.sleep(index === 2 ? 500 : 80);
        return Response.json({ index, echo: request.headers.get("authorization") }, { status: index === 1 ? 503 : 200 });
      } finally { active--; }
    } }));
    try {
      const f = await fixture(Object.fromEntries(servers.map((s, i) => [`target${i}`, s.url.origin])));
      const before = await readFile(f.file, "utf8");
      const output = await f.invoke(exec("--concurrency", "3", "--timeout-ms", "250"));
      expect(output.code).toBe(1);
      expect(peak).toBe(3);
      const report = output.envelope.result as Report;
      expect(report.summary).toEqual({ total: 3, success: 1, failed: 1, timeout: 1 });
      expect(report.results.map((r) => [r.context, r.outcome])).toEqual([["target0", "success"], ["target1", "failed"], ["target2", "timeout"]]);
      expect(report.results[1]!.response.error?.code).toBe("HTTP_503");
      expect(report.results[2]!.response.error?.code).toBe("TIMEOUT");
      expect(report.results.every((item) => item.response.command === "dag list")).toBe(true);
      expect(requests.sort()).toEqual(["0:/api/v1/dags?perPage=2", "1:/api/v1/dags?perPage=2", "2:/api/v1/dags?perPage=2"]);
      expect(await readFile(f.file, "utf8")).toBe(before);
    } finally { servers.forEach((s) => s.stop(true)); }
  });

  test("bounded worker slots, per-target budget starts after queue wait, stable order and all-success exit", async () => {
    let active = 0;
    let peak = 0;
    const server = Bun.serve({ port: 0, async fetch() {
      active++; peak = Math.max(active, peak);
      await Bun.sleep(80);
      active--;
      return Response.json({ dags: [] });
    } });
    try {
      const f = await fixture({ d: server.url.origin, c: server.url.origin, b: server.url.origin, a: server.url.origin });
      const output = await f.invoke(exec("--concurrency", "2", "--timeout-ms", "150"));
      expect(output.code).toBe(0);
      expect(peak).toBe(2);
      const report = output.envelope.result as Report;
      expect(report.summary).toEqual({ total: 4, success: 4, failed: 0, timeout: 0 });
      expect(report.results.map((r) => r.context)).toEqual(["a", "b", "c", "d"]);
    } finally { server.stop(true); }
  });

  test("credential failure does not fall back to environment or prevent other targets", async () => {
    let count = 0;
    const server = Bun.serve({ port: 0, fetch() { count++; return Response.json({}); } });
    try {
      const f = await fixture({ a: server.url.origin, b: server.url.origin });
      const stored = JSON.parse(await readFile(f.file, "utf8"));
      stored.contexts.a.apiKeyFile = "missing";
      await writeFile(f.file, JSON.stringify(stored));
      const output = await f.invoke(exec());
      expect(output.code).toBe(1);
      const report = output.envelope.result as Report;
      expect(report.summary).toEqual({ total: 2, success: 1, failed: 1, timeout: 0 });
      expect(report.results[0]!.response.error?.code).toBe("CONFIG");
      expect(count).toBe(1);
    } finally { server.stop(true); }
  });

  test("mock API targets receive the identical prepared payload (no real server writes)", async () => {
    const bodies: string[] = [];
    const server = Bun.serve({ port: 0, async fetch(request) {
      expect(request.method).toBe("POST");
      bodies.push(await request.text());
      return Response.json({ accepted: true });
    } });
    try {
      const f = await fixture({ a: server.url.origin, b: server.url.origin });
      const output = await f.invoke(["context", "exec", "--selector", "group=test", "--", "dag", "enqueue", "demo", "--param", "sample=value"]);
      expect(output.code).toBe(0);
      expect(bodies.length).toBe(2);
      expect(bodies[0]).toBe(bodies[1]);
      expect(JSON.parse(bodies[0]!)).toEqual({ params: '{"sample":"value"}' });
    } finally { server.stop(true); }
  });

  test("transport failure and a stalled response body are collected with an unaffected success", async () => {
    const server = Bun.serve({ port: 0, fetch(request) {
      if (new URL(request.url).pathname.startsWith("/slow")) return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"partial":')); } }));
      return Response.json({ dags: [] });
    } });
    try {
      const f = await fixture({ a: "http://127.0.0.1:1", b: `${server.url.origin}/slow`, c: server.url.origin });
      const output = await f.invoke(exec("--timeout-ms", "150"));
      expect(output.code).toBe(1);
      const report = output.envelope.result as Report;
      expect(report.summary).toEqual({ total: 3, success: 1, failed: 1, timeout: 1 });
      expect(report.results[0]!.response.error?.code).toBe("TRANSPORT");
      expect(report.results[1]!.response.error?.code).toBe("TIMEOUT");
    } finally { server.stop(true); }
  });

  test("AND selectors exclude other targets without changing current context", async () => {
    let count = 0;
    const server = Bun.serve({ port: 0, fetch() { count++; return Response.json({}); } });
    try {
      const f = await fixture({ a: server.url.origin, b: server.url.origin });
      const stored = JSON.parse(await readFile(f.file, "utf8"));
      stored.contexts.a.labels.extra = "yes";
      await writeFile(f.file, JSON.stringify(stored));
      const output = await f.invoke(exec("--selector", "extra=yes"));
      expect(output.code).toBe(0);
      expect((output.envelope.result as Report).results.map((r) => r.context)).toEqual(["a"]);
      expect(count).toBe(1);
    } finally { server.stop(true); }
  });

  test("whole-file validation identifies an invalid unselected context before requests", async () => {
    let count = 0;
    const server = Bun.serve({ port: 0, fetch() { count++; return Response.json({}); } });
    try {
      const f = await fixture({ valid: server.url.origin });
      const stored = JSON.parse(await readFile(f.file, "utf8"));
      stored.contexts.malformed = { labels: { group: "other" } };
      await writeFile(f.file, JSON.stringify(stored));
      const output = await f.invoke(exec());
      expect(output.code).toBe(2);
      expect(output.envelope.error?.message).toContain('Invalid context "malformed"');
      expect(count).toBe(0);
    } finally { server.stop(true); }
  });

  test("reject invalid limits, selector/command errors and unsafe overrides before any HTTP", async () => {
    let count = 0;
    const server = Bun.serve({ port: 0, fetch() { count++; return Response.json({}); } });
    try {
      const f = await fixture({ a: server.url.origin });
      const base = ["context", "exec", "--selector", "group=test"];
      const commands = [
        [...base], [...base, "--"], ["context", "exec", "--", "dag", "list"],
        [...base, "--selector", "group=other", "--", "dag", "list"],
        [...base, "--concurrency", "0", "--", "dag", "list"],
        [...base, "--concurrency", "33", "--", "dag", "list"],
        [...base, "--timeout-ms", "300001", "--", "dag", "list"],
        [...base, "--timeout-ms", "NaN", "--", "dag", "list"],
        [...base, "--concurrency", "1", "--concurrency", "2", "--", "dag", "list"],
        ...[["context", "ls"], ["dag"], ["dag", "get"], ["dag", "list", "--unknown", "1"],
          ["dag", "list", "--base-url", server.url.origin], ["-c", "a", "dag", "list"],
          ["dag", "params", "demo"], ["run", "log", "demo", "id", "--stream", "true"],
          ["run", "log", "demo", "id", "--query", '{"stream":true}'],
          ["dag", "list", "--timeout-ms", "2"], ["webhook", "trigger", "demo", "--token", "hidden"],
          ["dag", "start", "demo", "--params-file", "-"], ["dag", "start", "demo", "--body-file", "/dev/null"],
        ].map((command) => [...base, "--", ...command]),
        ["context", "exec", "--selector", "group=missing", "--", "dag", "list"],
      ];
      for (const args of commands) expect((await f.invoke(args)).code).toBe(2);
      expect(count).toBe(0);
      const help = await f.invoke(["context", "exec", "--help"]);
      expect(help.code).toBe(0);
      expect(JSON.stringify(help.envelope.result)).toContain("--concurrency");
    } finally { server.stop(true); }
  });
});
