import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { usage } from "./errors.ts";

const specPath = join(dirname(fileURLToPath(import.meta.url)), "../spec/openapi.json");

type Json = null | boolean | number | string | Json[] | { readonly [key: string]: Json };

export type Parameter = {
  readonly name: string;
  readonly location: "path" | "query" | "header" | "cookie";
  readonly required: boolean;
  readonly description: string;
};

export type Operation = {
  readonly operationId: string;
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly path: string;
  readonly tag: string;
  readonly summary: string;
  readonly parameters: readonly Parameter[];
  readonly bodyProperties: readonly string[];
  readonly bodyRequired: boolean;
};

type Spec = {
  readonly paths?: Record<string, Record<string, unknown>>;
  readonly components?: { readonly parameters?: Record<string, unknown> };
};

const METHODS = new Set(["get", "post", "put", "patch", "delete"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const loadSpec = (): Spec => JSON.parse(readFileSync(specPath, "utf8")) as Spec;

const resolveParameter = (spec: Spec, value: unknown): Record<string, unknown> | undefined => {
  if (!isRecord(value)) return undefined;
  const ref = value.$ref;
  if (typeof ref !== "string") return value;
  const name = ref.split("/").at(-1);
  const target = name ? spec.components?.parameters?.[name] : undefined;
  return isRecord(target) ? target : undefined;
};

const parametersOf = (spec: Spec, operation: Record<string, unknown>): Parameter[] => {
  const raw = Array.isArray(operation.parameters) ? operation.parameters : [];
  const parameters: Parameter[] = [];
  for (const item of raw) {
    const parameter = resolveParameter(spec, item);
    if (!parameter || typeof parameter.name !== "string") continue;
    const location = parameter.in;
    if (location !== "path" && location !== "query" && location !== "header" && location !== "cookie") continue;
    parameters.push({
      name: parameter.name,
      location,
      required: parameter.required === true || location === "path",
      description: typeof parameter.description === "string" ? parameter.description : "",
    });
  }
  return parameters;
};

const bodyOf = (operation: Record<string, unknown>): { readonly properties: string[]; readonly required: boolean } => {
  if (!isRecord(operation.requestBody)) return { properties: [], required: false };
  const content = isRecord(operation.requestBody.content) ? operation.requestBody.content["application/json"] : undefined;
  const schema = isRecord(content) && isRecord(content.schema) ? content.schema : undefined;
  const properties = schema && isRecord(schema.properties) ? Object.keys(schema.properties) : [];
  return { properties, required: operation.requestBody.required === true };
};

export const operations = Effect.sync((): readonly Operation[] => {
  const spec = loadSpec();
  const found: Operation[] = [];
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(item)) {
      if (!METHODS.has(method) || !isRecord(operation) || typeof operation.operationId !== "string") continue;
      const body = bodyOf(operation);
      const tags = Array.isArray(operation.tags) ? operation.tags : [];
      found.push({
        operationId: operation.operationId,
        method: method.toUpperCase() as Operation["method"],
        path,
        tag: typeof tags[0] === "string" ? tags[0] : "default",
        summary: typeof operation.summary === "string" ? operation.summary : "",
        parameters: parametersOf(spec, operation),
        bodyProperties: body.properties,
        bodyRequired: body.required,
      });
    }
  }
  return found.sort((left, right) => left.operationId.localeCompare(right.operationId));
});

export const findOperation = (operationId: string) =>
  Effect.gen(function* () {
    const all = yield* operations;
    const found = all.find((operation) => operation.operationId === operationId);
    if (!found) return yield* Effect.fail(usage(`Unknown operationId ${operationId}. Run: dagu-cli operations`));
    return found;
  });

export type { Json };
