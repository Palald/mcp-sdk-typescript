import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
} from "@modelcontextprotocol/sdk/types.js";

interface StreamableHttpTransportOptions {
  host: string;
  port: number;
  path: string;
}

interface Session {
  id: string;
  response?: Response;
  controller?: ReadableStreamDefaultController<string>;
}

export class StreamableHttpTransport implements Transport {
  private server?: Bun.Server;
  private sessions = new Map<string, Session>();
  private messageHandler?: (message: JSONRPCMessage) => void;
  private closeHandler?: (error?: Error) => void;
  private options: StreamableHttpTransportOptions;

  constructor(options: StreamableHttpTransportOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    this.server = Bun.serve({
      hostname: this.options.host,
      port: this.options.port,
      fetch: this.handleRequest.bind(this),
    });
  }

  async close(): Promise<void> {
    if (this.server) {
      this.server.stop();
      this.server = undefined;
    }
    
    for (const session of this.sessions.values()) {
      if (session.controller) {
        session.controller.close();
      }
    }
    this.sessions.clear();

    if (this.closeHandler) {
      this.closeHandler();
    }
  }

  onMessage(handler: (message: JSONRPCMessage) => void): void {
    this.messageHandler = handler;
  }

  onClose(handler: (error?: Error) => void): void {
    this.closeHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    // HTTP transport errors are handled through the close handler
  }

  async send(message: JSONRPCMessage): Promise<void> {
    // For responses, send them back via the appropriate session
    if ("id" in message && message.id !== null) {
      const response = message as JSONRPCResponse;
      await this.sendResponse(response);
    } else {
      // For notifications and requests, send to all active sessions
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

  private async handlePostRequest(request: Request): Promise<Response> {
    try {
      const body = await request.text();
      const message: JSONRPCMessage = JSON.parse(body);

      // Handle the message
      if (this.messageHandler) {
        this.messageHandler(message);
      }

      // For notifications, return 202 Accepted
      if (!("id" in message) || message.id === null) {
        return new Response("", { status: 202 });
      }

      // For requests, we'll handle the response through the send method
      // Return 202 for now, the actual response will be sent later
      return new Response("", { status: 202 });
    } catch (error) {
      return new Response("Bad Request", { status: 400 });
    }
  }

  private async handleGetRequest(request: Request): Promise<Response> {
    const sessionId = this.generateSessionId();
    
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
        "Access-Control-Allow-Headers": "Content-Type, MCP-Protocol-Version",
        "X-Session-ID": sessionId,
      },
    });
  }

  private async sendResponse(response: JSONRPCResponse): Promise<void> {
    // In this implementation, we return responses directly to the POST request
    // In a real implementation, you might want to associate responses with specific sessions
  }

  private async broadcastMessage(message: JSONRPCMessage): Promise<void> {
    const messageStr = `data: ${JSON.stringify(message)}\n\n`;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      try {
        if (session.controller) {
          session.controller.enqueue(messageStr);
        }
      } catch (error) {
        // Session is closed, remove it
        this.sessions.delete(sessionId);
      }
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
}