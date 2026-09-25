import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { run } from "../src/program.ts";

const secret = "dagu_test_secret_value";

describe("dagu-cli", () => {
  test("lists vendored operations without a server or key", async () => {
    const envelope = await Effect.runPromise(run(["operations", "--tag", "dags"]));
    expect(envelope.ok).toBe(true);
    const result = envelope.result as { count: number; operations: { operationId: string }[] };
    expect(result.count).toBeGreaterThan(10);
    expect(result.operations.some((operation) => operation.operationId === "ListDAGs")).toBe(true);
    expect(JSON.stringify(envelope)).not.toContain(secret);
  });

  test("describes a path parameter", async () => {
    const envelope = await Effect.runPromise(run(["describe", "ExecuteDAG"]));
    expect(envelope.ok).toBe(true);
    const result = envelope.result as { parameters: { name: string; in: string; required: boolean }[] };
    expect(result.parameters.some((parameter) => parameter.name === "fileName" && parameter.in === "path" && parameter.required)).toBe(true);
  });

  test("call sends the bearer token and returns the JSON body", async () => {
    let authorization = "";
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        authorization = request.headers.get("authorization") ?? "";
        const url = new URL(request.url);
        if (url.pathname === "/api/v1/dags/demo/start" && request.method === "POST") {
          return Response.json({ status: "started", echo: url.searchParams.get("remoteNode") });
        }
        return new Response("nope", { status: 404 });
      },
    });
    const previousKey = process.env.DAGU_API_KEY;
    process.env.DAGU_API_KEY = secret;
    try {
      const envelope = await Effect.runPromise(run([
        "call",
        "ExecuteDAG",
        "--base-url",
        `http://127.0.0.1:${server.port}`,
        "--path",
        JSON.stringify({ fileName: "demo" }),
        "--query",
        JSON.stringify({ remoteNode: "local" }),
        "--body",
        JSON.stringify({ params: "{}" }),
      ]));
      expect(envelope.ok).toBe(true);
      expect(envelope.status).toBe(200);
      expect(authorization).toBe(`Bearer ${secret}`);
      expect(JSON.stringify(envelope)).not.toContain(secret);
      const body = (envelope.result as { body: { echo: string } }).body;
      expect(body.echo).toBe("local");
    } finally {
      if (previousKey === undefined) delete process.env.DAGU_API_KEY;
      else process.env.DAGU_API_KEY = previousKey;
      server.stop(true);
    }
  });

  test("missing key is a config error and does not call the network", async () => {
    const previousKey = process.env.DAGU_API_KEY;
    const previousToken = process.env.DAGU_API_TOKEN;
    delete process.env.DAGU_API_KEY;
    delete process.env.DAGU_API_TOKEN;
    try {
      const error = await Effect.runPromise(run(["call", "ListDAGs"])).then(() => undefined, (cause: unknown) => cause);
      expect(error).toMatchObject({ code: "CONFIG" });
      expect(JSON.stringify(error)).not.toContain("dagu_");
    } finally {
      if (previousKey === undefined) delete process.env.DAGU_API_KEY;
      else process.env.DAGU_API_KEY = previousKey;
      if (previousToken === undefined) delete process.env.DAGU_API_TOKEN;
      else process.env.DAGU_API_TOKEN = previousToken;
    }
  });
});
