import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonSchema, Tool, tool } from "ai";
import { createMCPClient } from "./createMCPClient.js";

/**
 * Fetches and wraps tools from an MCP client for use with AI models.
 * @param client The MCP client to fetch tools from.
 * @param clientName The name of the client for reconnection purposes.
 * @param clientUrl The URL of the client for reconnection purposes.
 * @returns A record of tool names to Tool instances.
 */
export async function getMCPClientTools(
  client: Client,
  clientName?: string,
  clientUrl?: string
): Promise<Record<string, Tool>> {
  const toolsResult = await client.listTools();
  const tools: Record<string, Tool> = {};
  for (const {
    name,
    description,
    inputSchema,
    outputSchema,
  } of toolsResult.tools) {
    try {
      const toolDefinition: any = {
        description,
        inputSchema: jsonSchema(
          (inputSchema as any) || {
            type: "object",
            properties: {},
            additionalProperties: false,
          }
        ),
        execute: async (args: Record<string, any>) => {
          try {
            console.log(`TOOL: ${name}`, args);
            let result;
            try {
              result = await client.callTool({ name, arguments: args });
            } catch (sessionError: any) {
              // Check if it's a session expiration error
              if (
                sessionError.message?.includes("Session expired") ||
                sessionError.message?.includes("session expired") ||
                (sessionError.message?.includes("Bad Request") &&
                  sessionError.message?.includes("reinitialize"))
              ) {
                console.log(
                  `Session expired for ${name}, attempting to reconnect...`
                );

                // Try to reconnect if we have the client info
                if (clientName && clientUrl) {
                  try {
                    const newClient = await createMCPClient(
                      clientName,
                      clientUrl
                    );
                    result = await newClient.callTool({
                      name,
                      arguments: args,
                    });
                    console.log(
                      `Successfully reconnected and executed ${name}`
                    );
                  } catch (reconnectError) {
                    console.error(
                      `Failed to reconnect MCP client ${clientName}:`,
                      reconnectError
                    );
                    throw new Error(
                      `MCP session expired and reconnection failed. Please restart the backend service.`
                    );
                  }
                } else {
                  throw new Error(
                    `MCP session expired. Please restart the backend service to reinitialize connections.`
                  );
                }
              } else {
                throw sessionError;
              }
            }

            console.log(`TOOL RESULT: ${name}`, result);

            // If the tool has an outputSchema, return the structured data
            // Otherwise, return the content for backward compatibility
            if (outputSchema) {
              // Extract structured data (exclude 'content' and other MCP-specific fields)
              const { content, _meta, isError, structuredContent } = result;
              // TODO if isError, handle it appropriately
              // TODO validate result with outputSchema
              return structuredContent;
            } else {
              return result.content;
            }
          } catch (error) {
            console.error(`Error calling MCP tool ${name}:`, error);
            console.error(
              `Args that caused error:`,
              JSON.stringify(args, null, 2)
            );
            throw error;
          }
        },
      };

      // Add outputSchema to the tool definition if it exists
      if (outputSchema) {
        toolDefinition.outputSchema = jsonSchema(outputSchema as any);
      }

      tools[name] = tool(toolDefinition);
    } catch (error) {
      console.error(`Error creating tool ${name}:`, error);
      // Skip this tool if it can't be created
      continue;
    }
  }
  return tools;
}
