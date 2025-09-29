#!/usr/bin/env bun

/**
 * Example: Simple Calculator MCP Server
 * 
 * Demonstrates the clean architecture with proper separation of concerns:
 * - MCPApp handles MCP protocol and capabilities
 * - Transport handles HTTP/SSE mechanics only
 * - Tools provide actual functionality
 */

import { MCPApp, TextResponse, ErrorResponse } from "../src/index.js";
import { z } from "zod";

// Create MCP App with server info
const app = new MCPApp({
  name: "Calculator Server", 
  version: "1.0.0",
  transport: {
    host: "localhost",
    port: 3000,
    path: "/calculator"
  }
});

// Tool 1: Basic arithmetic operations
app.createTool({
  name: "calculate",
  description: "Perform basic arithmetic operations (add, subtract, multiply, divide)",
  schema: z.object({
    operation: z.enum(["add", "subtract", "multiply", "divide"]),
    a: z.number().describe("First number"),
    b: z.number().describe("Second number")
  }),
  handler: async function* ({ operation, a, b }) {
    yield new TextResponse(`🔢 Calculating ${a} ${operation} ${b}...`);
    
    let result: number;
    let symbol: string;
    
    switch (operation) {
      case "add":
        result = a + b;
        symbol = "+";
        break;
      case "subtract":
        result = a - b;
        symbol = "-";
        break;
      case "multiply":
        result = a * b;
        symbol = "×";
        break;
      case "divide":
        if (b === 0) {
          yield new ErrorResponse("Cannot divide by zero");
          return;
        }
        result = a / b;
        symbol = "÷";
        break;
    }
    
    yield new TextResponse(`✅ ${a} ${symbol} ${b} = ${result}`);
  }
});

// Tool 2: Power calculation
app.createTool({
  name: "power",
  description: "Calculate a number raised to a power",
  schema: z.object({
    base: z.number().describe("The base number"),
    exponent: z.number().describe("The exponent")
  }),
  handler: async function* ({ base, exponent }) {
    yield new TextResponse(`🔢 Calculating ${base} raised to the power of ${exponent}...`);
    
    const result = Math.pow(base, exponent);
    yield new TextResponse(`✅ ${base}^${exponent} = ${result}`);
  }
});

// Tool 3: Square root
app.createTool({
  name: "sqrt",
  description: "Calculate the square root of a number",
  schema: z.object({
    number: z.number().min(0).describe("The number to find square root of (must be non-negative)")
  }),
  handler: async function* ({ number }) {
    yield new TextResponse(`🔢 Calculating square root of ${number}...`);
    
    const result = Math.sqrt(number);
    yield new TextResponse(`✅ √${number} = ${result}`);
  }
});

// Tool 4: Factorial
app.createTool({
  name: "factorial",
  description: "Calculate the factorial of a non-negative integer",
  schema: z.object({
    n: z.number().int().min(0).max(20).describe("Integer from 0 to 20")
  }),
  handler: async function* ({ n }) {
    yield new TextResponse(`🔢 Calculating factorial of ${n}...`);
    
    let result = 1;
    for (let i = 2; i <= n; i++) {
      result *= i;
    }
    
    yield new TextResponse(`✅ ${n}! = ${result}`);
  }
});

// Start the server
console.log("🧮 Starting Calculator MCP Server...");
console.log("📊 Available operations:");
console.log("  • calculate - Basic arithmetic (+, -, ×, ÷)");
console.log("  • power - Exponentiation (a^b)");
console.log("  • sqrt - Square root (√a)");
console.log("  • factorial - Factorial (n!)");
console.log("");

await app.start();

console.log("");
console.log("🔗 Test with MCP Inspector:");
console.log("   URL: http://localhost:3000/calculator");
console.log("   Transport: streamable-http");
console.log("");
console.log("📝 Example requests:");
console.log('   {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"calculate","arguments":{"operation":"add","a":5,"b":3}}}');
console.log('   {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"power","arguments":{"base":2,"exponent":8}}}');
console.log('   {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"sqrt","arguments":{"number":144}}}');
console.log('   {"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"factorial","arguments":{"n":5}}}');

// Keep the server running
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down Calculator MCP Server...');
  await app.stop();
  process.exit(0);
});