export type ProjectedParam = {
  readonly name?: string;
  readonly positional?: true;
  readonly type?: string;
  readonly default?: string | number | boolean;
  readonly enum?: readonly (string | number | boolean)[];
  readonly description?: string;
  readonly required?: true;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly pattern?: string;
};

export type ParamsView = {
  readonly fileName: string;
  readonly name?: string;
  readonly type?: string;
  readonly suspended?: boolean;
  readonly description?: string;
  readonly labels: readonly string[];
  readonly errors: readonly string[];
  readonly source: "paramDefs" | "paramSchema" | "none";
  readonly params: readonly ProjectedParam[];
  readonly omittedDeprecated: readonly string[];
  readonly unmapped?: readonly string[];
};

export type ProjectionResult = { readonly ok: true; readonly view: ParamsView } | { readonly ok: false };

const SCALAR_TYPES = new Set(["string", "integer", "number", "boolean"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isScalar = (value: unknown): value is string | number | boolean =>
  typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

const isDeprecatedDescription = (value: unknown): boolean => typeof value === "string" && value.startsWith("Deprecated");

const stringList = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const scalarKind = (value: string | number | boolean): "string" | "integer" | "number" | "boolean" => {
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "boolean";
  return Number.isInteger(value) ? "integer" : "number";
};

const compatible = (declared: string, value: string | number | boolean): boolean => {
  const kind = scalarKind(value);
  return declared === kind || (declared === "number" && kind === "integer");
};

const emit = (fields: {
  readonly name?: string;
  readonly positional?: true;
  readonly type?: string;
  readonly default?: string | number | boolean;
  readonly enum?: readonly (string | number | boolean)[];
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly pattern?: string;
  readonly description?: string;
  readonly required?: true;
}): ProjectedParam => {
  const param: Record<string, unknown> = {};
  if (fields.name !== undefined) param.name = fields.name;
  if (fields.positional) param.positional = true;
  if (fields.type !== undefined) param.type = fields.type;
  if ("default" in fields) param.default = fields.default;
  if (fields.enum !== undefined && fields.enum.length > 0) param.enum = fields.enum;
  if (fields.minLength !== undefined) param.minLength = fields.minLength;
  if (fields.maxLength !== undefined) param.maxLength = fields.maxLength;
  if (fields.minimum !== undefined) param.minimum = fields.minimum;
  if (fields.maximum !== undefined) param.maximum = fields.maximum;
  if (fields.pattern !== undefined) param.pattern = fields.pattern;
  if (fields.description !== undefined) param.description = fields.description;
  if (fields.required) param.required = true;
  return param as ProjectedParam;
};

const optionalInteger = (record: Record<string, unknown>, key: string): number | undefined => {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
};

const optionalNumber = (record: Record<string, unknown>, key: string): number | undefined => {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const optionalEnum = (value: unknown): readonly (string | number | boolean)[] | undefined => {
  if (!Array.isArray(value) || value.some((item) => !isScalar(item))) return undefined;
  return value.filter(isScalar);
};

const paramFromDef = (record: Record<string, unknown>): ProjectedParam => {
  const name = typeof record.name === "string" && record.name.length > 0 ? record.name : undefined;
  const type = typeof record.type === "string" && SCALAR_TYPES.has(record.type) ? record.type : undefined;
  return emit({
    ...(name ? { name } : { positional: true as const }),
    ...(type ? { type } : {}),
    ...("default" in record && isScalar(record.default) ? { default: record.default } : {}),
    ...(optionalEnum(record.enum) ? { enum: optionalEnum(record.enum) } : {}),
    ...(optionalInteger(record, "minLength") !== undefined ? { minLength: optionalInteger(record, "minLength") } : {}),
    ...(optionalInteger(record, "maxLength") !== undefined ? { maxLength: optionalInteger(record, "maxLength") } : {}),
    ...(optionalNumber(record, "minimum") !== undefined ? { minimum: optionalNumber(record, "minimum") } : {}),
    ...(optionalNumber(record, "maximum") !== undefined ? { maximum: optionalNumber(record, "maximum") } : {}),
    ...(typeof record.pattern === "string" ? { pattern: record.pattern } : {}),
    ...(typeof record.description === "string" ? { description: record.description } : {}),
    ...(record.required === true ? { required: true as const } : {}),
  });
};

const constsFromOneOf = (
  value: unknown,
  parentType: string | undefined,
): { readonly type?: string; readonly enum: readonly (string | number | boolean)[] } | undefined => {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const consts: (string | number | boolean)[] = [];
  let agreed: string | undefined;
  for (const branch of value) {
    if (!isRecord(branch) || !("const" in branch) || !isScalar(branch.const)) return undefined;
    const declared = typeof branch.type === "string" ? branch.type : scalarKind(branch.const);
    if (!SCALAR_TYPES.has(declared) || !compatible(declared, branch.const)) return undefined;
    if (agreed === undefined) agreed = declared;
    else if (agreed !== declared) return undefined;
    consts.push(branch.const);
  }
  if (parentType !== undefined && agreed !== undefined && parentType !== agreed && !(parentType === "number" && agreed === "integer")) {
    return undefined;
  }
  return { ...(parentType ?? agreed ? { type: parentType ?? agreed } : {}), enum: consts };
};

const flattenProperty = (name: string, value: unknown, required: boolean): ProjectedParam | undefined => {
  if (!isRecord(value)) return undefined;
  if ("default" in value && !isScalar(value.default)) return undefined;
  if ("enum" in value && optionalEnum(value.enum) === undefined) return undefined;
  if ("description" in value && typeof value.description !== "string") return undefined;
  if ("pattern" in value && typeof value.pattern !== "string") return undefined;
  for (const key of ["minLength", "maxLength"]) {
    if (key in value && optionalInteger(value, key) === undefined) return undefined;
  }
  for (const key of ["minimum", "maximum"]) {
    if (key in value && optionalNumber(value, key) === undefined) return undefined;
  }

  const declared = typeof value.type === "string" && SCALAR_TYPES.has(value.type) ? value.type : undefined;
  if (value.type !== undefined && declared === undefined) return undefined;
  const oneOf = "oneOf" in value ? constsFromOneOf(value.oneOf, declared) : undefined;
  if ("oneOf" in value && oneOf === undefined) return undefined;
  const type = declared ?? oneOf?.type;
  if (type === undefined) return undefined;
  if (oneOf && "enum" in value) {
    const listed = optionalEnum(value.enum);
    if (!listed || listed.length !== oneOf.enum.length || listed.some((item, index) => item !== oneOf.enum[index])) return undefined;
  }
  const enumerated = oneOf?.enum ?? optionalEnum(value.enum);

  return emit({
    name,
    type,
    ...("default" in value && isScalar(value.default) ? { default: value.default } : {}),
    ...(enumerated && enumerated.length > 0 ? { enum: enumerated } : {}),
    ...(optionalInteger(value, "minLength") !== undefined ? { minLength: optionalInteger(value, "minLength") } : {}),
    ...(optionalInteger(value, "maxLength") !== undefined ? { maxLength: optionalInteger(value, "maxLength") } : {}),
    ...(optionalNumber(value, "minimum") !== undefined ? { minimum: optionalNumber(value, "minimum") } : {}),
    ...(optionalNumber(value, "maximum") !== undefined ? { maximum: optionalNumber(value, "maximum") } : {}),
    ...(typeof value.pattern === "string" ? { pattern: value.pattern } : {}),
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    ...(required ? { required: true as const } : {}),
  });
};

const paramsFromSchema = (schema: Record<string, unknown>): { readonly params: readonly ProjectedParam[]; readonly unmapped: readonly string[] } | undefined => {
  if (!isRecord(schema.properties)) return undefined;
  const required = new Set(stringList(schema.required));
  const params: ProjectedParam[] = [];
  const unmapped: string[] = [];
  for (const name of Object.keys(schema.properties)) {
    const param = flattenProperty(name, schema.properties[name], required.has(name));
    if (param) params.push(param);
    else unmapped.push(name);
  }
  return { params, unmapped };
};

const selectParams = (
  params: readonly ProjectedParam[],
  includeDeprecated: boolean,
): { readonly params: readonly ProjectedParam[]; readonly omittedDeprecated: readonly string[] } => {
  if (includeDeprecated) return { params, omittedDeprecated: [] };
  const kept: ProjectedParam[] = [];
  const omittedDeprecated: string[] = [];
  for (const param of params) {
    if (param.name !== undefined && param.required !== true && isDeprecatedDescription(param.description)) {
      omittedDeprecated.push(param.name);
      continue;
    }
    kept.push(param);
  }
  return { params: kept, omittedDeprecated };
};

export const projectDagParams = (body: unknown, options: { readonly fileName: string; readonly includeDeprecated: boolean }): ProjectionResult => {
  if (!isRecord(body) || !isRecord(body.dag)) return { ok: false };
  const dag = body.dag;
  let source: ParamsView["source"] = "none";
  let selected = selectParams([], options.includeDeprecated);
  let unmapped: readonly string[] | undefined;
  if (Array.isArray(dag.paramDefs)) {
    source = "paramDefs";
    selected = selectParams(dag.paramDefs.filter(isRecord).map(paramFromDef), options.includeDeprecated);
  } else if (isRecord(dag.paramSchema)) {
    const flattened = paramsFromSchema(dag.paramSchema);
    if (flattened) {
      source = "paramSchema";
      selected = selectParams(flattened.params, options.includeDeprecated);
      if (flattened.unmapped.length > 0) unmapped = flattened.unmapped;
    }
  }

  const view: ParamsView = {
    fileName: options.fileName,
    ...(typeof dag.name === "string" ? { name: dag.name } : {}),
    ...(typeof dag.type === "string" ? { type: dag.type } : {}),
    ...(typeof body.suspended === "boolean" ? { suspended: body.suspended } : {}),
    ...(typeof dag.description === "string" ? { description: dag.description } : {}),
    labels: stringList(dag.labels),
    errors: stringList(body.errors),
    source,
    params: selected.params,
    omittedDeprecated: selected.omittedDeprecated,
    ...(unmapped ? { unmapped } : {}),
  };
  return { ok: true, view };
};
