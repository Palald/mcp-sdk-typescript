/**
 * @fileoverview MCP Bun Library - Core exports for Model Context Protocol implementation
 * 
 * This library provides a streamable HTTP transport layer for MCP using Bun runtime,
 * enabling efficient real-time communication between AI models and external tools.
 */

/**
 * Core library exports for MCP Bun implementation
 */
export { MCPApp } from "./app.js";
export { StreamableHttpTransport } from "./transport.js";
export { zodToJsonSchema, createToolHandler } from "./schemas.js";

/**
 * Transport configuration types
 */
export type { 
  StreamableHttpTransportOptions,
} from "./transport.js";
export {
  MCPResponse,
  TextResponse,
  ImageResponse,
  ResourceResponse,
  RawResponse,
  ErrorResponse,
  ProgressResponse,
  LogResponse,
} from "./responses.js";

/**
 * Re-export commonly used types from dependencies for convenient access
 */
export { z } from "zod";