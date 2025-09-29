import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
} from "@modelcontextprotocol/sdk/types.js";


/**
 * Configuration options for StreamableHttpTransport
 * 
 * Defines the network binding and endpoint configuration for the HTTP transport layer.
 */
export interface StreamableHttpTransportOptions {
  /** Hostname or IP address to bind the server to */
  host: string;
  /** Port number for the HTTP server */
  port: number;
  /** URL path for MCP endpoint requests */
  path: string;
}

/**
 * Represents an active client session for event streaming
 * 
 * Sessions maintain persistent connections for real-time communication
 * with MCP clients through Server-Sent Events (SSE).
 */
interface Session {
  /** Unique session identifier for tracking connections */
  id: string;
  /** HTTP response object for the session (optional) */
  response?: Response;
  /** Stream controller for sending data to the client */
  controller?: ReadableStreamDefaultController<string>;
}

/**
 * Tracks pending requests awaiting responses
 * 
 * Maps request IDs to their originating sessions for proper response routing.
 */
interface PendingRequest {
  /** ID of the JSON-RPC request */
  requestId: string | number;
  /** Session ID where the request originated */
  sessionId: string;
  /** Timestamp when the request was received */
  timestamp: number;
}

/**
 * HTTP transport implementation for MCP with streaming capabilities
 * 
 * Provides a Bun-based HTTP server that implements the MCP Transport interface,
 * supporting both request-response and real-time streaming communication patterns.
 * Uses Server-Sent Events (SSE) for persistent connections and immediate message delivery.
 * 
 * Features:
 * - RESTful POST endpoint for MCP requests
 * - GET endpoint for establishing SSE streams
 * - Session management for multiple concurrent clients
 * - Origin validation for security
 * - MCP protocol version negotiation
 * 
 * @example
 * ```typescript
 * const transport = new StreamableHttpTransport({
 *   host: 'localhost',
 *   port: 3000,
 *   path: '/mcp'
 * });
 * 
 * transport.onMessage((message) => {
 *   console.log('Received:', message);
 * });
 * 
 * await transport.start();
 * ```
 */
/**
 * Runtime detection utility
 */
class RuntimeDetection {
  /**
   * Checks if the current runtime is Bun
   * 
   * @returns True if running in Bun environment
   */
  static isBun(): boolean {
    return typeof Bun !== 'undefined' && typeof Bun.serve === 'function';
  }

  /**
   * Checks if the current runtime is Node.js
   * 
   * @returns True if running in Node.js environment
   */
  static isNode(): boolean {
    return typeof process !== 'undefined' && process.versions && Boolean(process.versions.node);
  }

  /**
   * Gets the current runtime name
   * 
   * @returns Runtime identifier string
   */
  static getRuntime(): 'bun' | 'node' | 'unknown' {
    if (this.isBun()) return 'bun';
    if (this.isNode()) return 'node';
    return 'unknown';
  }
}

export class StreamableHttpTransport implements Transport {
  private server?: any; // Can be Bun.Server or Node.js server
  private sessions = new Map<string, Session>();
  private pendingRequests = new Map<string | number, PendingRequest>();
  private options: StreamableHttpTransportOptions;
  private runtime: 'bun' | 'node' | 'unknown';

  // MCP SDK Transport interface properties  
  onmessage?: (message: JSONRPCMessage, extra?: any) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  sessionId?: string;

  /**
   * Type guard to check if a message is a JSON-RPC request
   * 
   * @param message - The message to check
   * @returns True if the message is a JSONRPCRequest
   */
  private isJSONRPCRequest(message: JSONRPCMessage): message is JSONRPCRequest {
    return "method" in message && "id" in message && message.id !== null;
  }

  /**
   * Type guard to check if a message is a JSON-RPC notification
   * 
   * @param message - The message to check
   * @returns True if the message is a JSONRPCNotification
   */
  private isJSONRPCNotification(message: JSONRPCMessage): message is JSONRPCNotification {
    return "method" in message && (!("id" in message) || message.id === null);
  }

  /**
   * Type guard to check if a message is a JSON-RPC response
   * 
   * @param message - The message to check
   * @returns True if the message is a JSONRPCResponse
   */
  private isJSONRPCResponse(message: JSONRPCMessage): message is JSONRPCResponse {
    return "id" in message && message.id !== null && !("method" in message);
  }

  /**
   * Creates a new StreamableHttpTransport instance
   * 
   * Automatically detects the runtime environment (Bun vs Node.js) and
   * optimizes server creation accordingly.
   * 
   * @param options - Transport configuration including host, port, and path
   */
  constructor(options: StreamableHttpTransportOptions) {
    this.options = options;
    this.runtime = RuntimeDetection.getRuntime();
    
    if (this.runtime === 'unknown') {
      throw new Error('Unsupported runtime environment. This SDK requires Bun or Node.js.');
    }
  }

  /**
   * Starts the HTTP server and begins listening for connections
   * 
   * Automatically uses the optimal server implementation based on runtime:
   * - Bun: Uses Bun.serve for maximum performance
   * - Node.js: Uses Node.js HTTP server with similar API
   * 
   * @returns Promise that resolves when the server is successfully started
   * @throws {Error} When server fails to bind to the specified host/port
   */
  async start(): Promise<void> {
    console.log("🚀 Transport.start() called");
    try {
      if (this.runtime === 'bun') {
        this.server = Bun.serve({
          hostname: this.options.host,
          port: this.options.port,
          fetch: this.handleRequest.bind(this),
          idleTimeout: 255, // Maximum allowed by Bun
        });
      } else if (this.runtime === 'node') {
        // Lazy import Node.js modules to avoid issues in Bun
        const { createServer } = await import('http');
        
        this.server = createServer(async (req, res) => {
          try {
            // Convert Node.js request to Fetch API Request
            const url = `http://${req.headers.host || this.options.host}${req.url}`;
            const headers = new Headers();
            
            for (const [key, value] of Object.entries(req.headers)) {
              if (Array.isArray(value)) {
                value.forEach(v => headers.append(key, v));
              } else if (value) {
                headers.set(key, value);
              }
            }
            
            let body = '';
            if (req.method !== 'GET' && req.method !== 'HEAD') {
              const chunks: Buffer[] = [];
              for await (const chunk of req) {
                chunks.push(chunk);
              }
              body = Buffer.concat(chunks).toString();
            }
            
            const request = new Request(url, {
              method: req.method,
              headers,
              body: body || undefined,
            });
            
            const response = await this.handleRequest(request);
            
            // Convert Fetch Response back to Node.js response
            res.statusCode = response.status;
            response.headers.forEach((value, key) => {
              res.setHeader(key, value);
            });
            
            if (response.body) {
              const reader = response.body.getReader();
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  res.write(value);
                }
              } finally {
                reader.releaseLock();
              }
            }
            res.end();
          } catch (error) {
            res.statusCode = 500;
            res.end('Internal Server Error');
            const serverError = error instanceof Error ? error : new Error(String(error));
            this.handleError(serverError, 'Node.js request handling failed');
          }
        });
        
        await new Promise<void>((resolve, reject) => {
          this.server.listen(this.options.port, this.options.host, (error?: Error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      } else {
        throw new Error(`Unsupported runtime: ${this.runtime}`);
      }
    } catch (error) {
      const startupError = error instanceof Error ? error : new Error(String(error));
      this.handleError(startupError, `${this.runtime} server startup failed`);
      throw startupError;
    }
  }

  /**
   * Gracefully closes the HTTP server and all active sessions
   * 
   * Stops the server, closes all active SSE connections, and cleans up resources.
   * All connected clients will be disconnected.
   * 
   * @returns Promise that resolves when shutdown is complete
   */
  async close(): Promise<void> {
    console.log("🛑 Transport.close() called");
    try {
      if (this.server) {
        if (this.runtime === 'bun') {
          this.server.stop();
        } else if (this.runtime === 'node') {
          await new Promise<void>((resolve, reject) => {
            this.server.close((error?: Error) => {
              if (error) reject(error);
              else resolve();
            });
          });
        }
        this.server = undefined;
      }
      
      for (const session of this.sessions.values()) {
        if (session.controller) {
          try {
            session.controller.close();
          } catch (error) {
            const closeError = error instanceof Error ? error : new Error(String(error));
            this.handleError(closeError, 'Failed to close session');
          }
        }
      }
      this.sessions.clear();
      
      // Clear pending requests on shutdown
      this.pendingRequests.clear();

      if (this.onclose) {
        this.onclose();
      }
    } catch (error) {
      const shutdownError = error instanceof Error ? error : new Error(String(error));
      this.handleError(shutdownError, 'Transport shutdown failed');
      if (this.onclose) {
        this.onclose();
      }
    }
  }


  /**
   * Sends a message to connected clients with proper type discrimination
   * 
   * Routes messages based on their specific JSON-RPC type:
   * - Responses: Sent back to the originating session
   * - Requests: Broadcast to all active sessions (for server-initiated requests)
   * - Notifications: Broadcast to all active sessions
   * 
   * @param message - JSON-RPC message to send
   * @returns Promise that resolves when message is sent
   */
  async send(message: JSONRPCMessage, options?: any): Promise<void> {
    console.log("📤 Transport.send called with:", JSON.stringify(message, null, 2));
    
    if (this.isJSONRPCResponse(message)) {
      console.log("📄 Detected as JSONRPCResponse - calling sendResponse");
      // Handle responses - send back via the appropriate session
      await this.sendResponse(message);
    } else if (this.isJSONRPCRequest(message)) {
      console.log("📋 Detected as JSONRPCRequest - broadcasting");
      // Handle server-initiated requests - broadcast to all sessions
      await this.broadcastMessage(message);
    } else if (this.isJSONRPCNotification(message)) {
      console.log("📢 Detected as JSONRPCNotification - broadcasting");
      // Handle notifications - broadcast to all sessions
      await this.broadcastMessage(message);
    } else {
      console.log("❓ Unknown message type - broadcasting");
      // Fallback for any unrecognized message types
      await this.broadcastMessage(message);
    }
  }

  private async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname !== this.options.path) {
      return new Response("Not Found", { status: 404 });
    }

    // Validate origin for security
    const origin = request.headers.get("origin");
    if (origin && !this.isValidOrigin(origin)) {
      return new Response("Forbidden", { status: 403 });
    }

    // Check MCP protocol version
    const protocolVersion = request.headers.get("MCP-Protocol-Version") || "2025-03-26";
    if (!this.isSupportedProtocolVersion(protocolVersion)) {
      return new Response("Unsupported Protocol Version", { status: 400 });
    }

    if (request.method === "POST") {
      return this.handlePostRequest(request);
    } else if (request.method === "GET") {
      return this.handleGetRequest(request);
    }

    return new Response("Method Not Allowed", { status: 405 });
  }

  /**
   * Handles incoming POST requests with JSON-RPC messages
   * 
   * @param request - The HTTP request containing JSON-RPC message
   * @returns HTTP response based on message type
   */
  private async handlePostRequest(request: Request): Promise<Response> {
    console.log("🔵 POST request received");
    
    try {
      // Validate Accept header as per MCP specification
      const acceptHeader = request.headers.get("Accept");
      console.log("📋 Accept header:", acceptHeader);
      
      if (!acceptHeader || (!acceptHeader.includes("application/json") && !acceptHeader.includes("text/event-stream"))) {
        console.log("❌ Invalid Accept header");
        return new Response("Bad Request: Accept header must include application/json or text/event-stream", { 
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const body = await request.text();
      console.log("📨 Request body:", body);
      
      const message: JSONRPCMessage = JSON.parse(body);
      console.log("📦 Parsed message:", JSON.stringify(message, null, 2));
      
      // Extract session ID from headers for request correlation (MCP spec header name)
      const sessionId = request.headers.get("Mcp-Session-Id");
      console.log("🔐 Session ID:", sessionId);

      // For initialize requests, we need to wait for and return the response immediately
      if (this.isJSONRPCRequest(message) && "method" in message && message.method === "initialize") {
        console.log("🚀 INITIALIZE request detected - setting up special handling");
        
        // Handle initialize specially - must return JSON response immediately
        return new Promise((resolve) => {
          // Set up a one-time response handler
          const originalSend = this.send.bind(this);
          console.log("🔄 Hijacking send method for initialize response");
          
          this.send = async (responseMessage: JSONRPCMessage) => {
            console.log("📤 Send method called with message:", JSON.stringify(responseMessage, null, 2));
            
            // Restore original send method
            this.send = originalSend;
            console.log("🔄 Restored original send method");
            
            if (this.isJSONRPCResponse(responseMessage) && responseMessage.id === message.id) {
              console.log("✅ Found matching initialize response - returning immediately");
              // This is the initialize response - return it immediately
              resolve(new Response(JSON.stringify(responseMessage), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }));
            } else {
              console.log("🔀 Different message - forwarding to original handler");
              // Forward other messages to original handler
              await originalSend(responseMessage);
            }
          };
          
          // Now process the initialize request
          console.log("📨 Calling onmessage for initialize request");
          if (this.onmessage) {
            this.onmessage(message);
          } else {
            console.log("❌ No onmessage handler registered!");
          }
        });
      }

      // Handle the message through the registered handler
      console.log("📨 Processing message through onmessage");
      if (this.onmessage) {
        this.onmessage(message);
      } else {
        console.log("❌ No onmessage handler registered for regular message!");
      }

      // Return appropriate HTTP status based on message type
      if (this.isJSONRPCNotification(message)) {
        // Notifications don't expect a response
        return new Response("", { 
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      } else if (this.isJSONRPCRequest(message)) {
        // Track request for response correlation if we have a session
        if (sessionId && "id" in message && message.id !== null) {
          this.pendingRequests.set(message.id, {
            requestId: message.id,
            sessionId,
            timestamp: Date.now(),
          });
        }
        
        // Check if client accepts streaming response
        if (acceptHeader.includes("text/event-stream")) {
          // Return streaming response for requests
          const stream = new ReadableStream<string>({
            start: (controller) => {
              // Store controller for sending response later
              if (sessionId) {
                const session = this.sessions.get(sessionId);
                if (session) {
                  session.controller = controller;
                }
              }
            },
          });
          
          return new Response(stream.pipeThrough(new TextEncoderStream()), {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
            },
          });
        } else {
          // Return 202 for JSON responses
          return new Response("", { 
            status: 202,
            headers: { "Content-Type": "application/json" },
          });
        }
      } else {
        // Invalid or unrecognized message format
        return new Response("Invalid JSON-RPC message", { 
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (error) {
      const parseError = error instanceof Error ? error : new Error(String(error));
      this.handleError(parseError, 'Failed to parse JSON-RPC message');
      return new Response("Bad Request", { 
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  /**
   * Handles GET requests for establishing Server-Sent Events streams
   * 
   * Creates a persistent connection for real-time message delivery to clients.
   * Each connection gets a unique session ID for tracking.
   * 
   * @param request - The HTTP GET request
   * @returns Response with SSE stream
   */
  private async handleGetRequest(request: Request): Promise<Response> {
    console.log("🟢 GET request received for SSE stream");
    
    // Check for existing session ID in headers
    const existingSessionId = request.headers.get("Mcp-Session-Id");
    const sessionId = existingSessionId || this.generateSessionId();
    console.log("🔐 SSE Session ID:", sessionId, existingSessionId ? "(existing)" : "(new)");
    
    const stream = new ReadableStream<string>({
      start: (controller) => {
        const session: Session = {
          id: sessionId,
          controller,
        };
        this.sessions.set(sessionId, session);
      },
      cancel: () => {
        this.sessions.delete(sessionId);
      },
    });

    return new Response(stream.pipeThrough(new TextEncoderStream()), {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id",
        "Mcp-Session-Id": sessionId,
      },
    });
  }

  /**
   * Sends a JSON-RPC response back to the originating client
   * 
   * Routes responses to the correct session using request-response correlation.
   * If no session is found, the response is broadcast to all active sessions.
   * 
   * @param response - The JSON-RPC response to send
   */
  private async sendResponse(response: JSONRPCResponse): Promise<void> {
    try {
      const responseId = response.id;
      
      // Find the pending request to get the target session
      const pendingRequest = this.pendingRequests.get(responseId);
      
      if (pendingRequest) {
        // Remove the pending request as it's now being fulfilled
        this.pendingRequests.delete(responseId);
        
        // Find the target session
        const targetSession = this.sessions.get(pendingRequest.sessionId);
        
        if (targetSession && targetSession.controller) {
          // Send response to the specific session
          const responseStr = `data: ${JSON.stringify(response)}\n\n`;
          try {
            targetSession.controller.enqueue(responseStr);
          } catch (error) {
            // Session is closed, remove it and fall back to broadcast
            this.sessions.delete(pendingRequest.sessionId);
            const sessionError = error instanceof Error ? error : new Error(String(error));
            this.handleError(sessionError, `Failed to send response to session ${pendingRequest.sessionId}`);
            await this.broadcastMessage(response);
          }
        } else {
          // Session not found, broadcast to all sessions as fallback
          this.handleError(new Error(`Session ${pendingRequest.sessionId} not found`), 'Response routing failed');
          await this.broadcastMessage(response);
        }
      } else {
        // No pending request found, broadcast to all sessions
        // This could happen for server-initiated responses or late responses
        await this.broadcastMessage(response);
      }
    } catch (error) {
      const responseError = error instanceof Error ? error : new Error(String(error));
      this.handleError(responseError, 'Failed to send response');
      // Fallback: try to broadcast
      try {
        await this.broadcastMessage(response);
      } catch (broadcastError) {
        const fallbackError = broadcastError instanceof Error ? broadcastError : new Error(String(broadcastError));
        this.handleError(fallbackError, 'Failed to broadcast response as fallback');
      }
    }
  }

  /**
   * Broadcasts a message to all active sessions
   * 
   * @param message - JSON-RPC message to broadcast
   */
  private async broadcastMessage(message: JSONRPCMessage): Promise<void> {
    try {
      const messageStr = `data: ${JSON.stringify(message)}\n\n`;
      
      for (const [sessionId, session] of this.sessions.entries()) {
        try {
          if (session.controller) {
            session.controller.enqueue(messageStr);
          }
        } catch (error) {
          // Session is closed, remove it and log the error
          this.sessions.delete(sessionId);
          const sessionError = error instanceof Error ? error : new Error(String(error));
          this.handleError(sessionError, `Session ${sessionId} closed unexpectedly`);
        }
      }
    } catch (error) {
      const broadcastError = error instanceof Error ? error : new Error(String(error));
      this.handleError(broadcastError, 'Failed to broadcast message');
    }
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  private isValidOrigin(origin: string): boolean {
    // Implement origin validation logic here
    // For development, allow localhost origins
    try {
      const url = new URL(origin);
      return url.hostname === "localhost" || url.hostname === "127.0.0.1";
    } catch {
      return false;
    }
  }

  private isSupportedProtocolVersion(version: string): boolean {
    // Support current version
    return version === "2025-03-26";
  }

  /**
   * Internal helper to handle transport errors consistently
   * 
   * @param error - The error that occurred
   * @param context - Additional context about where the error occurred
   */
  private handleError(error: Error, context: string): void {
    if (this.onerror) {
      // Enhance error with context information
      const enhancedError = new Error(`${context}: ${error.message}`);
      enhancedError.stack = error.stack;
      enhancedError.cause = error;
      this.onerror(enhancedError);
    }
  }

  /**
   * Cleans up old pending requests that have exceeded the timeout
   * 
   * Should be called periodically to prevent memory leaks from abandoned requests.
   * 
   * @param timeoutMs - Maximum age for pending requests in milliseconds (default: 30 seconds)
   */
  private cleanupPendingRequests(timeoutMs: number = 30000): void {
    const now = Date.now();
    const expiredRequests: (string | number)[] = [];
    
    for (const [requestId, pendingRequest] of this.pendingRequests.entries()) {
      if (now - pendingRequest.timestamp > timeoutMs) {
        expiredRequests.push(requestId);
      }
    }
    
    for (const requestId of expiredRequests) {
      this.pendingRequests.delete(requestId);
    }
    
    if (expiredRequests.length > 0) {
      this.handleError(
        new Error(`Cleaned up ${expiredRequests.length} expired pending requests`),
        'Request timeout cleanup',
      );
    }
  }
}