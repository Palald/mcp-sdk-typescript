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

// Tool definition interface with generator handler
interface ToolDefinition<T extends z.ZodObject<any>> {
  name: string;
  description?: string;
  schema: T;
  handler: (args: z.infer<T>) => AsyncGenerator<MCPResponse, void, unknown>;
}

// Registered tool with runtime handler
interface RegisteredTool {
  name: string;
  description?: string;
  schema: z.ZodObject<any>;
  handler: (args: unknown) => Promise<{ content: Array<{ type: string; [key: string]: any }> }>;
}

// App configuration
interface MCPAppOptions {
  name: string;
  version: string;
  transport?: {
    host?: string;
    port?: number;
    path?: string;
  };
}

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
          tools: {}
        },
      }
    );

    this.transportOptions = {
      host: options.transport?.host || 'localhost',
      port: options.transport?.port || 3000,
      path: options.transport?.path || '/mcp'
    };

    this.setupHandlers();
  }

  // Main method: create tool with auto-registration
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
            `${issue.path.join('.')}: ${issue.message}`
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
      handler: validatedHandler
    };

    this.tools.set(definition.name, registeredTool);
    
    console.log(`🔧 Registered tool: ${definition.name}`);
    
    // Return this for chaining
    return this;
  }

  // Get list of all registered tools for MCP protocol
  private getToolList() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description || `Execute ${tool.name} tool`,
      inputSchema: zodToJsonSchema(tool.schema)
    }));
  }

  // Execute a tool by name
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
        `Tool execution failed: ${error}`
      );
    }
  }

  // Setup MCP protocol handlers
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

  // Start the MCP server
  async start(): Promise<void> {
    const transport = new StreamableHttpTransport(this.transportOptions);
    await this.server.connect(transport);
    
    console.log(`🚀 MCP Server '${this.options.name}' started on http://${this.transportOptions.host}:${this.transportOptions.port}${this.transportOptions.path}`);
    console.log(`📋 Registered ${this.tools.size} tools: ${Array.from(this.tools.keys()).join(', ')}`);
  }

  // Stop the server
  async stop(): Promise<void> {
    await this.server.close();
    console.log(`🛑 MCP Server '${this.options.name}' stopped`);
  }
}