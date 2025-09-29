import { z } from "zod";

/**
 * Converts a Zod schema to JSON Schema format for MCP tools
 * 
 * Uses Zod's built-in toJSONSchema method to convert validation schemas
 * into JSON Schema format compatible with the MCP protocol.
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
 * ```
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): any {
  return z.toJSONSchema(schema);
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