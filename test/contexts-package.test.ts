import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rename, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

test("packed dagu-cli/contexts exports work in an isolated consumer, without source checkout imports", async () => {
  const temp = await mkdtemp(join(tmpdir(), "dagu-contexts-package-"));
  const archive = join(temp, "dagu-cli.tgz");
  const pack = Bun.spawn([process.execPath, "pm", "pack", "--ignore-scripts", "--filename", archive], { cwd: root, stdout: "pipe", stderr: "pipe" });
  await Promise.all([new Response(pack.stdout).text(), new Response(pack.stderr).text()]);
  expect(await pack.exited).toBe(0);
  const modules = join(temp, "node_modules");
  await mkdir(modules);
  const unpack = Bun.spawn(["tar", "-xzf", archive, "-C", modules], { stdout: "pipe", stderr: "pipe" });
  await Promise.all([new Response(unpack.stdout).text(), new Response(unpack.stderr).text()]);
  expect(await unpack.exited).toBe(0);
  const installed = join(modules, "dagu-cli");
  await rename(join(modules, "package"), installed);
  // Offline test: only the already-installed dependency is linked, never dagu-cli source.
  await symlink(join(root, "node_modules/effect"), join(modules, "effect"));
  const pkg = JSON.parse(await readFile(join(installed, "package.json"), "utf8"));
  expect(pkg.version).toBe("0.3.0");
  expect(pkg.exports["./contexts"].import).toBe("./src/contexts.public.ts");
  await writeFile(join(temp, "consumer.ts"), `
import { readContext, readContexts, selectContexts, labelPairs, executeContexts, CliError } from "dagu-cli/contexts";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
const file = join(import.meta.dir, "contexts.json");
const secret = "package-test-credential";
const key = join(import.meta.dir, "key");
await writeFile(key, secret, { mode: 0o600 });
const server = Bun.serve({ port: 0, fetch(request) {
 assert(request.method === "GET", "only read requests");
 assert(request.headers.get("authorization") === "Bearer " + secret, "named credential");
 return Response.json({ dags: [], echo: secret });
} });
try {
 const connection = { baseUrl: server.url.origin, apiKeyFile: "key", labels: { role: "test" }, future: { preserved: true } };
 await writeFile(file, JSON.stringify({ contexts: { a: connection, b: { ...connection, apiKeyFile: "missing" } } }), { mode: 0o600 });
 const beforeEnv = JSON.stringify(process.env);
 const beforeExitCode = process.exitCode;
 const stored = await readContexts(file);
 assert(selectContexts(stored, labelPairs(["role=test"])).join(",") === "a,b", "AND selector");
 assert((await readContext("a", file)).future.preserved, "unknown fields");
 assert(import.meta.resolve("dagu-cli/contexts").includes("node_modules/dagu-cli/src/contexts.public.ts"), "packed module resolved");
 const report = await executeContexts({ selector: { role: "test" }, command: ["dag", "list"], configFile: file, concurrency: 2, timeoutMs: 2000 });
 assert(report.result.summary.success === 1 && report.result.summary.failed === 1, "collect programmable results");
 assert(report.result.results.every((r) => r.response.command === "dag list"), "consistent leaf command name");
 assert(!JSON.stringify(report).includes(secret), "redacted credentials");
 assert(JSON.stringify(process.env) === beforeEnv && process.exitCode === beforeExitCode, "no process mutation");
 let rejected = false;
 try { await executeContexts({ selector: { role: "absent" }, command: ["dag", "list"], configFile: file }); }
 catch (e) { rejected = e instanceof CliError && e.code === "CONFIG"; }
 assert(rejected, "global config errors reject as CliError");
 let invalid = false;
 try { await executeContexts({ selector: { "bad=key": "value" }, command: ["dag", "list"], configFile: file }); }
 catch (e) { invalid = e instanceof CliError; }
 assert(invalid, "selector object validated without argv mangling");
 console.log(JSON.stringify({ version: "0.3.0", import: "dagu-cli/contexts", selected: ["a", "b"], summary: report.result.summary, leafCommand: "dag list", cliError: rejected, noProcessMutation: true, redaction: true }));
} finally { server.stop(true); }
`);
  const consumer = Bun.spawn([process.execPath, join(temp, "consumer.ts")], { cwd: temp, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(consumer.stdout).text(), new Response(consumer.stderr).text(), consumer.exited]);
  expect(stderr).toBe("");
  expect(code).toBe(0);
  const report = JSON.parse(stdout);
  expect(report.summary).toEqual({ total: 2, success: 1, failed: 1, timeout: 0 });
  expect(report.cliError).toBe(true);
  expect(report.redaction).toBe(true);
  console.log(`Packed contexts import PASS: ${stdout.trim()}; artifact=${archive}`);
});
