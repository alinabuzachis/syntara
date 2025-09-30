import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  Tool,
  UIMessage,
} from "ai";
import chalk from "chalk";
import cors from "cors";
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import { ollama } from "ollama-ai-provider-v2";
import { createMCPClient } from "./createMCPClient.js";
import { getMCPClientTools } from "./getMCPClientTools.js";

dotenv.config();

const mcpServers = [
  { name: "aap", url: "http://localhost:3003/mcp" },
  // { name: "sql", url: "http://localhost:3001/mcp" },
  { name: "dashboard", url: "http://localhost:3002/mcp" },
  // { name: "kubernetes", url: "http://localhost:8084/mcp" },
];

let tools: Record<string, Tool> | null = null;

async function getTools() {
  const clientData = await Promise.all(
    mcpServers.map(async (c) => ({
      client: await createMCPClient(c.name, process.env.MCP_URL || c.url),
      name: c.name,
      url: process.env.MCP_URL || c.url,
    }))
  );

  const tools: Record<string, Tool> = {};
  for (const { client, name, url } of clientData) {
    const clientTools = await getMCPClientTools(client, name, url);
    Object.assign(tools, clientTools);
  }
  console.log("Loaded tools:");
  Object.keys(tools).forEach((toolName) => {
    console.log(`${toolName} -`, tools[toolName].description || "");
  });
  return tools;
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post("/api/ai/stream", async (req: Request, res: Response) => {
  const abortController = new AbortController();

  req.on("aborted", () => {
    console.log("Request cancelled, aborting AI stream");
    abortController.abort();
  });

  try {
    const { messages }: { messages: UIMessage[] } = req.body;
    if (!messages || messages.length === 0) {
      console.log("No messages provided", req.body);
      return res.status(400).json({ error: "Messages are required" });
    }

    console.log("========================================");
    messages.forEach((message) => {
      // console.log(chalk.blue("MESSAGE:"), chalk.whiteBright(message.));
    });
    const system = [
      "You are a helpful assistant that helps users interact with their Ansible Automation Platform.",
      "Use the provided tools to answer user questions.",
      "If you don't know the answer, use the tools to find out. Always think step-by-step.",
      "CRITICAL: Never make up answers or mock data. Always use the available tools to get real data.",
      // "CRITICAL: When asked about AAP or dashboards, you MUST first get the available resource types.",
      "Look at the dashboard tool structured output schema to understand what widgets are available.",
      "Widgets types available are: bar_chart, pie_chart, kpi.",
      // "Try not to give charts with only one data point.",
      "When generating a dashboard, always determine the best widgets to add to the dashboard using real data from tools.",
    ].join(" ");
    console.log(chalk.blue("SYSTEM:"), chalk.whiteBright(system));

    const provider = ollama;
    const model = req.body.model || "gpt-oss:20b";

    if (!tools) {
      tools = await getTools();
    }
    console.log(chalk.blue("TOOLS:"), chalk.whiteBright(Object.keys(tools)));

    const result = await streamText({
      system,
      model: provider(model),
      messages: convertToModelMessages(messages),
      // prompt: [
      //   { role: "user", content: messages.map((m) => m.parts).join("\n") },
      // ],
      tools,
      stopWhen: stepCountIs(15),
      abortSignal: abortController.signal,
    });

    // result.pipeTextStreamToResponse(res);
    result.pipeUIMessageStreamToResponse(res); // TODO support rich message chats in the client

    const responseText = [];
    for await (const delta of result.textStream) {
      responseText.push(delta);
    }
    const reasoning = await result.reasoning;
    for (const step of reasoning) {
      console.log(chalk.blue("REASONING:"), step.text);
    }
    console.log(chalk.blue("RESPONSE:"), responseText.join(""));
    // res.end();
  } catch (error) {
    if (abortController.signal.aborted) {
      console.log("AI stream aborted by client cancellation");
      return;
    }
    console.error("AI streaming error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to stream AI response" });
    }
  }
});

app.get("/api/tools", (req: Request, res: Response) => {
  res.json(tools);
});

app.post("/api/tools/:toolName", async (req: Request, res: Response) => {
  try {
    if (!tools) {
      tools = await getTools();
    }

    const { toolName } = req.params;
    const tool = tools[toolName];
    if (!tool) return res.status(404).json({ error: "Tool not found" });
    if (!tool.execute) return res.status(404).json({ error: "Tool not found" });
    const args = req.body;
    const result = await tool.execute(args, {
      toolCallId: `http-${Date.now()}`,
      messages: [],
    });
    res.json({ result });
  } catch (error) {
    console.error(`Error calling tool ${req.params.toolName}:`, error);
    res.status(500).json({ error: "Failed to call tool" });
  }
});

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", service: "fleet-server" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
