import { z } from "zod";

/**
 * Converts a Zod schema to JSON Schema format for MCP tools
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): any {
  const def = (schema as any)._def;
  
  if (schema instanceof z.ZodString) {
    return { type: "string", description: def?.description };
  }
  
  if (schema instanceof z.ZodNumber) {
    return { type: "number", description: def?.description };
  }
  
  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean", description: def?.description };
  }
  
  if (schema instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodToJsonSchema((schema as any)._def.type),
      description: def?.description,
    };
  }
  
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    const shape = (schema as any)._def.shape();
    
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodTypeAny);
      
      // Check if the field is required (not optional)
      const valueDef = (value as any)._def;
      if (valueDef?.typeName !== "ZodOptional" && valueDef?.typeName !== "ZodDefault") {
        required.push(key);
      }
    }
    
    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
      description: def?.description,
    };
  }
  
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema((schema as any)._def.innerType);
  }
  
  if (schema instanceof z.ZodDefault) {
    const innerSchema = zodToJsonSchema((schema as any)._def.innerType);
    return {
      ...innerSchema,
      default: def?.defaultValue?.(),
    };
  }
  
  if (schema instanceof z.ZodEnum) {
    return {
      type: "string",
      enum: def?.values,
      description: def?.description,
    };
  }
  
  if (schema instanceof z.ZodUnion) {
    return {
      oneOf: def?.options?.map((option: z.ZodTypeAny) => zodToJsonSchema(option)),
      description: def?.description,
    };
  }
  
  // Fallback for unsupported types
  return { type: "string", description: def?.description || "Unknown type" };
}

/**
 * Creates a validated tool handler that automatically parses and validates arguments
 */
export function createToolHandler<T extends z.ZodTypeAny>(
  schema: T,
  handler: (args: z.infer<T>) => Promise<{ content: Array<{ type: string; text: string }> }>
) {
  return async (rawArgs: unknown) => {
    const args = schema.parse(rawArgs);
    return handler(args);
  };
}