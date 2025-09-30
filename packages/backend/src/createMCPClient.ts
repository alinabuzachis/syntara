import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * Creates a new Model Context Protocol (MCP) client.
 * @param name The name of the client.
 * @param url The URL of the MCP server.
 * @returns The created MCP client.
 */
export async function createMCPClient(name: string, url: string) {
  const client = new Client({ name, version: "1.0.0" }, { capabilities: {} });
  try {
    const transport = new StreamableHTTPClientTransport(new URL(url));
    await client.connect(transport);
    return client;
  } catch (e) {
    console.error("Failed to connect via StreamableHTTP, trying SSE", e);
    const transport = new SSEClientTransport(new URL(url));
    await client.connect(transport);
    return client;
  }
}
