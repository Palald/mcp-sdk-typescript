# MCP Bun Library

A streamable HTTP transport library for Model Context Protocol (MCP) using Bun runtime.

## Features

- 🚀 **Fast & Efficient**: Built on Bun for optimal performance
- 🔄 **Streamable HTTP Transport**: Real-time communication via HTTP streaming
- 🛠️ **Type-Safe Tool System**: Generator-based tools with Zod validation
- 📡 **MCP Protocol Compliant**: Full support for MCP 2025-03-26 specification
- 🔧 **Easy Integration**: Simple, chainable API for tool registration

## Installation

```bash
bun add mcp-bun-library
```

## Quick Start

```typescript
import { MCPApp, TextResponse, LogResponse, z } from "mcp-bun-library";

const app = new MCPApp({
  name: "my-mcp-server",
  version: "1.0.0",
  transport: {
    host: "localhost",
    port: 3000,
    path: "/mcp"
  }
});

app
  .createTool({
    name: "echo",
    description: "Echo back the input text",
    schema: z.object({
      text: z.string().describe("Text to echo back"),
      uppercase: z.boolean().optional().describe("Convert to uppercase")
    }),
    handler: async function* (args) {
      yield new LogResponse("Processing echo request", "info");
      const result = args.uppercase ? args.text.toUpperCase() : args.text;
      yield new TextResponse(`Echo: ${result}`);
    }
  })
  .createTool({
    name: "calculator",
    description: "Perform basic math operations",
    schema: z.object({
      operation: z.enum(["add", "subtract", "multiply", "divide"]),
      a: z.number(),
      b: z.number()
    }),
    handler: async function* (args) {
      let result: number;
      switch (args.operation) {
        case "add": result = args.a + args.b; break;
        case "subtract": result = args.a - args.b; break;
        case "multiply": result = args.a * args.b; break;
        case "divide": 
          if (args.b === 0) throw new Error("Division by zero");
          result = args.a / args.b; 
          break;
      }
      yield new TextResponse(`${args.a} ${args.operation} ${args.b} = ${result}`);
    }
  });

await app.start();
```

## Core Components

### MCPApp
The main application class that handles tool registration and server lifecycle.

### Response Types
- **TextResponse**: For text content
- **ImageResponse**: For image data
- **ResourceResponse**: For file/resource references
- **ProgressResponse**: For long-running operations
- **LogResponse**: For debugging information
- **ErrorResponse**: For error states
- **RawResponse**: For custom response types

### Transport Layer
`StreamableHttpTransport` provides HTTP-based communication with streaming support for real-time interactions.

## Development

```bash
# Install dependencies
bun install

# Build the library
bun run build

# Run type checking
bun run typecheck

# Run tests
bun test
```

## License

MIT