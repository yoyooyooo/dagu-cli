import { describe, expect, test } from "bun:test";
import { projectDagParams } from "../src/params.ts";

const project = (body: unknown, includeDeprecated = false) => {
  const result = projectDagParams(body, { fileName: "dispatch-herdr", includeDeprecated });
  if (!result.ok) throw new Error("expected a projection");
  return result.view;
};

describe("projectDagParams", () => {
  test("projects paramDefs and drops spec, steps, history, defaults, and tags", () => {
    const view = project({
      suspended: false,
      errors: [],
      spec: "PROMPT_SENTINEL steps: secret",
      latestDAGRun: { prompt: "PROMPT_SENTINEL" },
      dag: {
        name: "dispatch-herdr",
        type: "graph",
        description: "dispatch a worker",
        labels: ["purpose=dispatch", 1],
        tags: ["PROMPT_SENTINEL"],
        defaultParams: "PROMPT_SENTINEL",
        params: ["host=box", "package=hidden"],
        steps: [{ name: "PROMPT_SENTINEL" }],
        paramDefs: [
          { name: "callback", type: "string", description: "Deprecated alias of callback_url" },
          { name: "host", type: "string", default: "box", minLength: 1, maxLength: 64, description: "Worker host" },
          { name: "mode", type: "string", enum: ["plan", "apply"], description: "not a Deprecated prefix" },
          { name: "note", type: "string", default: "" },
          { name: "retries", type: "integer", minimum: 0, maximum: 5, description: "deprecated lowercase stays" },
          { name: "token", type: "string", pattern: "^[a-z]+$", required: true, description: "Deprecated but required" },
          { type: "string", description: "Deprecated positional stays visible" },
        ],
        paramSchema: { properties: { ignored: { type: "string" } } },
      },
    });

    expect(view).toEqual({
      fileName: "dispatch-herdr",
      name: "dispatch-herdr",
      type: "graph",
      suspended: false,
      description: "dispatch a worker",
      labels: ["purpose=dispatch"],
      errors: [],
      source: "paramDefs",
      params: [
        { name: "host", type: "string", default: "box", minLength: 1, maxLength: 64, description: "Worker host" },
        { name: "mode", type: "string", enum: ["plan", "apply"], description: "not a Deprecated prefix" },
        { name: "note", type: "string", default: "" },
        { name: "retries", type: "integer", minimum: 0, maximum: 5, description: "deprecated lowercase stays" },
        { name: "token", type: "string", pattern: "^[a-z]+$", description: "Deprecated but required", required: true },
        { positional: true, type: "string", description: "Deprecated positional stays visible" },
      ],
      omittedDeprecated: ["callback"],
    });
    expect(JSON.stringify(view)).not.toContain("PROMPT_SENTINEL");
    expect(JSON.stringify(view)).not.toContain("package=hidden");
    expect(JSON.stringify(view)).not.toContain("paramSchema");
  });

  test("include-deprecated keeps every def and clears omittedDeprecated", () => {
    const view = project(
      {
        dag: {
          paramDefs: [
            { name: "callback", type: "string", description: "Deprecated alias" },
            { name: "host", type: "string", default: false },
          ],
        },
      },
      true,
    );
    expect(view.omittedDeprecated).toEqual([]);
    expect(view.params.map((param) => param.name)).toEqual(["callback", "host"]);
    expect(view.params[1]?.default).toBe(false);
  });

  test("an empty paramDefs array wins over paramSchema", () => {
    const view = project({
      dag: { paramDefs: [], paramSchema: { properties: { host: { type: "string" } } } },
    });
    expect(view.source).toBe("paramDefs");
    expect(view.params).toEqual([]);
    expect(view.unmapped).toBeUndefined();
  });

  test("flattens paramSchema, surfaces oneOf consts, and lists unmapped names", () => {
    const view = project({
      suspended: true,
      errors: ["broken ref", { leak: "PROMPT_SENTINEL" }],
      dag: {
        paramSchema: {
          required: ["mode"],
          properties: {
            mode: {
              type: "string",
              description: "Run mode",
              oneOf: [
                { type: "string", const: "plan" },
                { type: "string", const: "apply" },
              ],
            },
            limit: { type: "integer", minimum: 0, default: 1 },
            nested: { type: "object", properties: { leak: "PROMPT_SENTINEL" } },
            alias: { type: "string", description: "Deprecated alias" },
          },
        },
      },
    });
    expect(view.suspended).toBe(true);
    expect(view.errors).toEqual(["broken ref"]);
    expect(view.source).toBe("paramSchema");
    expect(view.params).toEqual([
      { name: "mode", type: "string", enum: ["plan", "apply"], description: "Run mode", required: true },
      { name: "limit", type: "integer", default: 1, minimum: 0 },
    ]);
    expect(view.omittedDeprecated).toEqual(["alias"]);
    expect(view.unmapped).toEqual(["nested"]);
    expect(JSON.stringify(view)).not.toContain("PROMPT_SENTINEL");
  });

  test("a param-less DAG does not parse spec YAML", () => {
    const view = project({
      dag: { name: "dayflow-memory-digest", params: ["only=value"], spec: "params:\n  - from-yaml" },
      spec: "params:\n  - from-yaml",
    });
    expect(view.source).toBe("none");
    expect(view.params).toEqual([]);
    expect(view.omittedDeprecated).toEqual([]);
    expect(JSON.stringify(view)).not.toContain("from-yaml");
    expect(JSON.stringify(view)).not.toContain("only=value");
  });

  test("rejects a body that is not a DAG details object", () => {
    expect(projectDagParams(null, { fileName: "x", includeDeprecated: false }).ok).toBe(false);
    expect(projectDagParams({ spec: "PROMPT_SENTINEL" }, { fileName: "x", includeDeprecated: false }).ok).toBe(false);
    expect(projectDagParams({ dag: [] }, { fileName: "x", includeDeprecated: false }).ok).toBe(false);
  });
});
