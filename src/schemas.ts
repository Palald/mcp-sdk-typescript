import { z } from "zod";

/**
 * Converts a Zod schema to JSON Schema format for MCP tools
 * 
 * Transforms Zod validation schemas into JSON Schema format compatible with
 * the MCP protocol. Supports common Zod types including objects, arrays,
 * primitives, enums, unions, and optional/default values.
 * 
 * @param schema - Zod schema to convert
 * @returns JSON Schema object compatible with MCP tool definitions
 * 
 * @example
 * ```typescript
 * const zodSchema = z.object({
 *   name: z.string().describe('User name'),
 *   age: z.number().optional()
 * });
 * 
 * const jsonSchema = zodToJsonSchema(zodSchema);
 * // Returns: {
 * //   type: 'object',
 * //   properties: {
 * //     name: { type: 'string', description: 'User name' },
 * //     age: { type: 'number' }
 * //   },
 * //   required: ['name']
 * // }
 * ```
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
 * 
 * Wraps a tool handler function with automatic Zod schema validation.
 * Arguments are parsed and validated before being passed to the handler function,
 * ensuring type safety and proper error handling for invalid inputs.
 * 
 * @template T - Zod schema type for argument validation
 * @param schema - Zod schema to validate arguments against
 * @param handler - Handler function that receives validated arguments
 * @returns Wrapped handler function with automatic validation
 * @throws {z.ZodError} When argument validation fails
 * 
 * @example
 * ```typescript
 * const validatedHandler = createToolHandler(
 *   z.object({ message: z.string() }),
 *   async (args) => {
 *     // args.message is guaranteed to be a string
 *     return { content: [{ type: 'text', text: args.message }] };
 *   }
 * );
 * ```
 */
export function createToolHandler<T extends z.ZodTypeAny>(
  schema: T,
  handler: (args: z.infer<T>) => Promise<{ content: Array<{ type: string; text: string }> }>,
) {
  return async (rawArgs: unknown) => {
    const args = schema.parse(rawArgs);
    return handler(args);
  };
}