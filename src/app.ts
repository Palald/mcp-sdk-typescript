import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { StreamableHttpTransport } from "./transport.js";
import { zodToJsonSchema } from "./schemas.js";
import { MCPResponse } from "./responses.js";
import { z } from "zod";

/**
 * Tool definition interface for creating MCP tools with generator-based handlers
 * 
 * @template T - Zod schema type that extends ZodObject for type-safe argument validation
 */
interface ToolDefinition<T extends z.ZodObject<any>> {
  /** Unique identifier for the tool */
  name: string;
  /** Human-readable description of what the tool does */
  description?: string;
  /** Zod schema for validating tool arguments */
  schema: T;
  /** Async generator function that yields MCP responses during execution */
  handler: (args: z.infer<T>) => AsyncGenerator<MCPResponse, void, unknown>;
}

/**
 * Internal representation of a registered tool with MCP-compatible handler
 * 
 * This interface represents tools after they've been processed and registered
 * with the MCP server, converting generator-based handlers to promise-based ones.
 */
interface RegisteredTool {
  /** Unique tool identifier */
  name: string;
  /** Tool description for MCP protocol */
  description?: string;
  /** Zod validation schema */
  schema: z.ZodObject<any>;
  /** Processed handler that returns MCP-formatted content */
  handler: (args: unknown) => Promise<{ content: Array<{ type: string; [key: string]: any }> }>;
}

/**
 * Configuration options for initializing an MCPApp instance
 * 
 * Defines the server identity and transport layer settings for the MCP application.
 */
interface MCPAppOptions {
  /** Application name for MCP server identification */
  name: string;
  /** Semantic version string for the application */
  version: string;
  /** Optional transport configuration settings */
  transport?: {
    /** Server hostname (defaults to 'localhost') */
    host?: string;
    /** Server port number (defaults to 3000) */
    port?: number;
    /** HTTP endpoint path (defaults to '/mcp') */
    path?: string;
  };
}

/**
 * Main application class for creating and managing MCP (Model Context Protocol) servers
 * 
 * MCPApp provides a high-level interface for building MCP-compatible servers that can
 * communicate with AI models through a streamable HTTP transport layer. It handles
 * tool registration, request validation, and response formatting automatically.
 * 
 * @example
 * ```typescript
 * const app = new MCPApp({ name: 'my-server', version: '1.0.0' });
 * 
 * app.createTool({
 *   name: 'greet',
 *   description: 'Greets a user by name',
 *   schema: z.object({ name: z.string() }),
 *   handler: async function* (args) {
 *     yield new TextResponse(`Hello, ${args.name}!`);
 *   }
 * });
 * 
 * await app.start();
 * ```
 */
export class MCPApp {
  private server: Server;
  private tools = new Map<string, RegisteredTool>();
  private transportOptions: Required<NonNullable<MCPAppOptions['transport']>>;

  constructor(private options: MCPAppOptions) {
    this.server = new Server(
      {
        name: options.name,
        version: options.version,
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.transportOptions = {
      host: options.transport?.host || 'localhost',
      port: options.transport?.port || 3000,
      path: options.transport?.path || '/mcp',
    };

    this.setupHandlers();
  }

  /**
   * Creates and registers a new tool with the MCP server
   * 
   * This is the primary method for adding functionality to your MCP server.
   * Tools are automatically validated and registered with type-safe argument parsing.
   * 
   * @template T - Zod schema type for tool arguments
   * @param definition - Tool configuration including name, schema, and handler
   * @returns This MCPApp instance for method chaining
   * @throws {Error} When tool name already exists or schema is invalid
   * 
   * @example
   * ```typescript
   * app.createTool({
   *   name: 'calculate',
   *   description: 'Performs mathematical calculations',
   *   schema: z.object({
   *     operation: z.enum(['add', 'subtract']),
   *     a: z.number(),
   *     b: z.number()
   *   }),
   *   handler: async function* (args) {
   *     const result = args.operation === 'add' ? args.a + args.b : args.a - args.b;
   *     yield new TextResponse(`Result: ${result}`);
   *   }
   * });
   * ```
   */
  createTool<T extends z.ZodObject<any>>(definition: ToolDefinition<T>): MCPApp {
    // Validate that schema is a Zod object
    if (!(definition.schema instanceof z.ZodObject)) {
      throw new Error(`Tool '${definition.name}' schema must be a Zod object (z.object({...}))`);
    }

    // Check for duplicate tool names
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool '${definition.name}' already exists`);
    }

    // Create validated handler that collects generator responses
    const validatedHandler = async (rawArgs: unknown) => {
      try {
        const validatedArgs = definition.schema.parse(rawArgs);
        const generator = definition.handler(validatedArgs);
        
        // Collect all yielded responses
        const responses: MCPResponse[] = [];
        for await (const response of generator) {
          responses.push(response);
        }
        
        // Convert to MCP format
        const content = responses.map(response => response.toMCPContent());
        
        return { content };
      } catch (error) {
        if (error instanceof z.ZodError) {
          const issues = error.issues.map(issue => 
            `${issue.path.join('.')}: ${issue.message}`,
          ).join(', ');
          throw new McpError(ErrorCode.InvalidParams, `Validation error: ${issues}`);
        }
        throw error;
      }
    };

    // Register the tool
    const registeredTool: RegisteredTool = {
      name: definition.name,
      description: definition.description,
      schema: definition.schema,
      handler: validatedHandler,
    };

    this.tools.set(definition.name, registeredTool);
    
    console.log(`🔧 Registered tool: ${definition.name}`);
    
    // Return this for chaining
    return this;
  }

  /**
   * Retrieves a list of all registered tools formatted for MCP protocol
   * 
   * @private
   * @returns Array of tool definitions with MCP-compatible schemas
   */
  private getToolList() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description || `Execute ${tool.name} tool`,
      inputSchema: zodToJsonSchema(tool.schema),
    }));
  }

  /**
   * Executes a registered tool with the provided arguments
   * 
   * @private
   * @param name - Name of the tool to execute
   * @param args - Arguments to pass to the tool handler
   * @returns Promise resolving to MCP-formatted tool response
   * @throws {McpError} When tool is not found or execution fails
   */
  private async executeTool(name: string, args: unknown) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
    }

    try {
      return await tool.handler(args);
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      
      throw new McpError(
        ErrorCode.InternalError,
        `Tool execution failed: ${error}`,
      );
    }
  }

  /**
   * Configures MCP protocol request handlers for tool operations
   * 
   * Sets up handlers for:
   * - tools/list: Returns available tools
   * - tools/call: Executes a specific tool
   * 
   * @private
   */
  private setupHandlers() {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: this.getToolList() };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return await this.executeTool(name, args);
    });
  }

  /**
   * Starts the MCP server and begins listening for connections
   * 
   * Initializes the HTTP transport layer and connects the MCP server.
   * The server will be accessible at the configured host, port, and path.
   * 
   * @returns Promise that resolves when the server is successfully started
   * @throws {Error} When server fails to start or transport initialization fails
   * 
   * @example
   * ```typescript
   * await app.start();
   * console.log('MCP server is now running!');
   * ```
   */
  async start(): Promise<void> {
    const transport = new StreamableHttpTransport(this.transportOptions);
    await this.server.connect(transport);
    
    console.log(`🚀 MCP Server '${this.options.name}' started on http://${this.transportOptions.host}:${this.transportOptions.port}${this.transportOptions.path}`);
    console.log(`📋 Registered ${this.tools.size} tools: ${Array.from(this.tools.keys()).join(', ')}`);
  }

  /**
   * Gracefully stops the MCP server and closes all connections
   * 
   * Shuts down the HTTP transport and closes the MCP server connection.
   * All active sessions will be terminated cleanly.
   * 
   * @returns Promise that resolves when the server is fully stopped
   * @throws {Error} When server shutdown encounters an error
   * 
   * @example
   * ```typescript
   * await app.stop();
   * console.log('MCP server has been stopped');
   * ```
   */
  async stop(): Promise<void> {
    await this.server.close();
    console.log(`🛑 MCP Server '${this.options.name}' stopped`);
  }
}