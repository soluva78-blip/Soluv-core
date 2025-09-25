type PrimitiveType = "string" | "number" | "boolean";
type EnumSchema = string[];
type UnionSchema = (PrimitiveType | null)[];

type Schema =
  | PrimitiveType
  | EnumSchema
  | UnionSchema
  | { [key: string]: Schema }
  | [Schema]; // array schema

export const jsonParser = <T>(input: string, schema?: Schema): T => {
  if (!input) {
    throw new Error("Input string is empty");
  }

  try {
    let cleanedAnalysis = input.trim();

    // Remove markdown code fences if present
    cleanedAnalysis = cleanedAnalysis
      .replace(/```json\s*/i, "")
      .replace(/```\s*$/i, "");

    // Find JSON object or array in the response
    const jsonMatch = cleanedAnalysis.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);

    const parsedResult = jsonMatch
      ? JSON.parse(jsonMatch[0])
      : JSON.parse(cleanedAnalysis);

    // Validate if schema provided
    if (schema) {
      validateSchema(parsedResult, schema);
    }

    return parsedResult as T;
  } catch (parseError) {
    console.error(
      "JSON parsing error:",
      parseError instanceof Error ? parseError.message : "Unknown error"
    );
    console.error("Failed input:", input);
    throw parseError;
  }
};

function validateSchema(value: any, schema: Schema, path: string = "root") {
  if (typeof schema === "string") {
    // Primitive
    if (typeof value !== schema) {
      throw new Error(
        `Schema error at ${path}: expected ${schema}, got ${typeof value}`
      );
    }
    return;
  }

  if (Array.isArray(schema)) {
    if (schema.length === 1) {
      // Array schema
      if (!Array.isArray(value)) {
        throw new Error(`Schema error at ${path}: expected array`);
      }
      value.forEach((item, idx) =>
        validateSchema(item, schema[0] as Schema, `${path}[${idx}]`)
      );
      return;
    }

    // Enum / Union
    const isValid = schema.some((r) => {
      if (r === null) return value === null;
      if (
        typeof r === "string" &&
        ["string", "number", "boolean"].includes(r)
      ) {
        return typeof value === r;
      }
      return value === r;
    });

    if (!isValid) {
      throw new Error(
        `Schema error at ${path}: expected one of ${JSON.stringify(
          schema
        )}, got ${value === null ? "null" : typeof value}`
      );
    }
    return;
  }

  // Object schema
  if (typeof schema === "object" && schema !== null) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`Schema error at ${path}: expected object`);
    }

    for (const [key, subSchema] of Object.entries(schema)) {
      if (!(key in value)) {
        throw new Error(`Schema error at ${path}: missing key "${key}"`);
      }
      validateSchema(value[key], subSchema, `${path}.${key}`);
    }
    return;
  }

  throw new Error(`Unsupported schema type at ${path}`);
}
