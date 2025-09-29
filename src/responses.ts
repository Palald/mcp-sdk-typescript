/**
 * Abstract base class for all MCP response types
 * 
 * Provides a common interface for converting response data into MCP-compatible
 * content format. All response classes must implement the toMCPContent method
 * to ensure proper serialization for the MCP protocol.
 * 
 * @abstract
 */
export abstract class MCPResponse {
  /**
   * Converts the response into MCP protocol format
   * 
   * @returns MCP-compatible content object with type and additional properties
   * @abstract
   */
  abstract toMCPContent(): { type: string; text?: string; [key: string]: any };
}

/**
 * Simple text response for returning plain text content
 * 
 * This is the most commonly used response type for returning textual information,
 * error messages, or any string-based data to MCP clients.
 * 
 * @example
 * ```typescript
 * yield new TextResponse('Hello, world!');
 * yield new TextResponse(`User ${name} has been created successfully`);
 * ```
 */
export class TextResponse extends MCPResponse {
  /**
   * Creates a new text response
   * 
   * @param text - The text content to return to the client
   */
  constructor(private text: string) {
    super();
  }

  toMCPContent() {
    return {
      type: "text",
      text: this.text,
    };
  }
}

/**
 * Image response for returning image data to MCP clients
 * 
 * Supports various image formats through MIME type specification.
 * Image data should be provided as base64-encoded strings or data URLs.
 * 
 * @example
 * ```typescript
 * // Base64 encoded image
 * yield new ImageResponse('iVBORw0KGgoAAAANSUhEUgAAAAEA...', 'image/png');
 * 
 * // Data URL
 * yield new ImageResponse('data:image/jpeg;base64,/9j/4AAQSkZJRg...', 'image/jpeg');
 * ```
 */
export class ImageResponse extends MCPResponse {
  /**
   * Creates a new image response
   * 
   * @param data - Base64-encoded image data or data URL
   * @param mimeType - MIME type of the image (defaults to 'image/png')
   */
  constructor(
    private data: string,
    private mimeType: string = "image/png",
  ) {
    super();
  }

  toMCPContent() {
    return {
      type: "image",
      data: this.data,
      mimeType: this.mimeType,
    };
  }
}

/**
 * Resource response for referencing external resources or files
 * 
 * Used to return references to files, URLs, or other resources that the client
 * can access. Optionally includes text content for inline resource data.
 * 
 * @example
 * ```typescript
 * // File reference
 * yield new ResourceResponse('file:///path/to/document.pdf');
 * 
 * // URL with description
 * yield new ResourceResponse('https://example.com/api/data', 'API endpoint data');
 * ```
 */
export class ResourceResponse extends MCPResponse {
  /**
   * Creates a new resource response
   * 
   * @param uri - URI/URL of the resource to reference
   * @param text - Optional text content or description of the resource
   */
  constructor(
    private uri: string,
    private text?: string,
  ) {
    super();
  }

  toMCPContent() {
    return {
      type: "resource",
      resource: {
        uri: this.uri,
        text: this.text,
      },
    };
  }
}

/**
 * Raw response for custom content types not covered by standard responses
 * 
 * Allows passing through arbitrary MCP content objects with custom types
 * and properties. Use this for specialized response formats or when extending
 * the MCP protocol with custom content types.
 * 
 * @example
 * ```typescript
 * // Custom chart data
 * yield new RawResponse({
 *   type: 'chart',
 *   data: { series: [...], labels: [...] },
 *   chartType: 'line'
 * });
 * ```
 */
export class RawResponse extends MCPResponse {
  /**
   * Creates a new raw response with custom content
   * 
   * @param content - MCP content object with custom type and properties
   */
  constructor(private content: { type: string; [key: string]: any }) {
    super();
  }

  toMCPContent() {
    return this.content;
  }
}

/**
 * Error response for reporting failures or exceptional conditions
 * 
 * Used to communicate errors back to MCP clients with optional error codes
 * for programmatic error handling. Follows standard error response patterns.
 * 
 * @example
 * ```typescript
 * // Simple error
 * yield new ErrorResponse('File not found');
 * 
 * // Error with code
 * yield new ErrorResponse('Invalid credentials', 'AUTH_FAILED');
 * ```
 */
export class ErrorResponse extends MCPResponse {
  /**
   * Creates a new error response
   * 
   * @param message - Human-readable error description
   * @param code - Optional error code for programmatic handling
   */
  constructor(
    private message: string,
    private code?: string,
  ) {
    super();
  }

  toMCPContent() {
    return {
      type: "error",
      error: {
        message: this.message,
        code: this.code,
      },
    };
  }
}

/**
 * Progress response for reporting status of long-running operations
 * 
 * Enables real-time progress reporting for operations that take significant time.
 * Supports both determinate (with total) and indeterminate progress indicators.
 * 
 * @example
 * ```typescript
 * // Determinate progress (50 out of 100)
 * yield new ProgressResponse('Processing files...', 50, 100);
 * 
 * // Indeterminate progress
 * yield new ProgressResponse('Connecting to server...', 0);
 * ```
 */
export class ProgressResponse extends MCPResponse {
  /**
   * Creates a new progress response
   * 
   * @param message - Description of the current operation
   * @param progress - Current progress value
   * @param total - Total expected value (for determinate progress)
   */
  constructor(
    private message: string,
    private progress: number,
    private total?: number,
  ) {
    super();
  }

  toMCPContent() {
    return {
      type: "progress",
      text: this.message,
      progress: this.progress,
      total: this.total,
    };
  }
}

/**
 * Log response for debugging, informational messages, and diagnostics
 * 
 * Provides structured logging capabilities with severity levels.
 * Useful for debugging tool execution and providing detailed operation traces.
 * 
 * @example
 * ```typescript
 * // Info message
 * yield new LogResponse('Operation completed successfully');
 * 
 * // Debug information
 * yield new LogResponse('Cache hit for key: user:123', 'debug');
 * 
 * // Warning
 * yield new LogResponse('Deprecated API usage detected', 'warn');
 * ```
 */
export class LogResponse extends MCPResponse {
  /**
   * Creates a new log response
   * 
   * @param message - Log message content
   * @param level - Severity level of the log message (defaults to 'info')
   */
  constructor(
    private message: string,
    private level: "debug" | "info" | "warn" | "error" = "info",
  ) {
    super();
  }

  toMCPContent() {
    return {
      type: "log",
      text: this.message,
      level: this.level,
    };
  }
}