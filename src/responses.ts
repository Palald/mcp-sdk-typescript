// Base response class
export abstract class MCPResponse {
  abstract toMCPContent(): { type: string; text?: string; [key: string]: any };
}

// Text response - most common type
export class TextResponse extends MCPResponse {
  constructor(private text: string) {
    super();
  }

  toMCPContent() {
    return {
      type: "text",
      text: this.text
    };
  }
}

// Image response
export class ImageResponse extends MCPResponse {
  constructor(
    private data: string,
    private mimeType: string = "image/png"
  ) {
    super();
  }

  toMCPContent() {
    return {
      type: "image",
      data: this.data,
      mimeType: this.mimeType
    };
  }
}

// Resource response
export class ResourceResponse extends MCPResponse {
  constructor(
    private uri: string,
    private text?: string
  ) {
    super();
  }

  toMCPContent() {
    return {
      type: "resource",
      resource: {
        uri: this.uri,
        text: this.text
      }
    };
  }
}

// Raw response for custom types
export class RawResponse extends MCPResponse {
  constructor(private content: { type: string; [key: string]: any }) {
    super();
  }

  toMCPContent() {
    return this.content;
  }
}

// Error response
export class ErrorResponse extends MCPResponse {
  constructor(
    private message: string,
    private code?: string
  ) {
    super();
  }

  toMCPContent() {
    return {
      type: "error",
      error: {
        message: this.message,
        code: this.code
      }
    };
  }
}

// Progress response for long-running operations
export class ProgressResponse extends MCPResponse {
  constructor(
    private message: string,
    private progress: number,
    private total?: number
  ) {
    super();
  }

  toMCPContent() {
    return {
      type: "progress",
      text: this.message,
      progress: this.progress,
      total: this.total
    };
  }
}

// Log response for debugging/info
export class LogResponse extends MCPResponse {
  constructor(
    private message: string,
    private level: "debug" | "info" | "warn" | "error" = "info"
  ) {
    super();
  }

  toMCPContent() {
    return {
      type: "log",
      text: this.message,
      level: this.level
    };
  }
}