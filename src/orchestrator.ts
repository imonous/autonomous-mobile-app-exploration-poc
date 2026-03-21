import { generateText, type LanguageModel } from "ai";
import { createGraph, addNode, addEdge, serialize, type Graph } from "./graph.js";
import { createSession, destroySession, takeScreenshot, tap, pressBack, scroll } from "./device.js";
import { tools, SYSTEM_PROMPT, MODEL_PRICING } from "./llm.js";
import { env } from "./env.js";
import { writeFile, mkdir } from "node:fs/promises";

interface ExploreOptions {
  maxSteps: number;
  staleLimit: number;
  model: LanguageModel;
  modelId: string;
}

const GRAPH_TOOLS = new Set(["addNode", "addEdge"]);
const DEVICE_TOOLS = new Set(["tap", "pressBack", "scroll", "exit"]);

export async function explore({
  maxSteps,
  staleLimit,
  model,
  modelId,
}: ExploreOptions): Promise<Graph> {
  const pricing = MODEL_PRICING[modelId] as
    | { inputPerMToken: number; outputPerMToken: number }
    | undefined;
  const browser = await createSession(env.APPIUM_URL);
  const graph = createGraph();

  let step = 0;
  let staleCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastAction: string | null = null;
  let screenshot = await takeScreenshot(browser);

  console.log("Starting exploration...\n");

  try {
    while (step < maxSteps && staleCount < staleLimit) {
      console.log(
        `--- Step ${String(step + 1)}/${String(maxSteps)} (stale: ${String(staleCount)}/${String(staleLimit)}) ---`,
      );

      let result;
      try {
        result = await generateText({
          model,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text" as const,
                  text: `Current graph:\n${serialize(graph)}${lastAction ? `\n\nLast action: ${lastAction}` : ""}`,
                },
                {
                  type: "image" as const,
                  image: screenshot,
                  mediaType: "image/png" as const,
                },
              ],
            },
          ],
          tools,
        });
      } catch (error) {
        console.error("LLM error:", error);
        throw error;
      }

      const inputTokens = result.usage.inputTokens ?? 0;
      const outputTokens = result.usage.outputTokens ?? 0;
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;

      if (result.text) {
        console.log(`\nThinking: ${result.text}\n`);
      }

      const toolCalls = result.toolCalls;
      console.log(
        `Tool calls: ${toolCalls.map((tc) => `${tc.toolName}(${JSON.stringify(tc.input)})`).join(", ") || "none"}`,
      );

      const graphOps = toolCalls.filter((tc) => GRAPH_TOOLS.has(tc.toolName));
      const deviceOps = toolCalls.filter((tc) => DEVICE_TOOLS.has(tc.toolName));

      let addedNodes = false;
      for (const op of graphOps) {
        try {
          if (op.toolName === "addNode") {
            const args = op.input as { summary: string };
            const id = addNode(graph, args.summary);
            console.log(`  Added node: ${id} — ${args.summary}`);
            addedNodes = true;
          } else if (op.toolName === "addEdge") {
            const args = op.input as { from: string; to: string; action: string };
            addEdge(graph, args.from, args.to, args.action);
            console.log(`  Added edge: ${args.from} → ${args.to} (${args.action})`);
          }
        } catch (error) {
          console.error(`Graph op ${op.toolName} failed:`, error);
          throw error;
        }
      }

      const deviceAction = deviceOps.at(-1);
      if (!deviceAction) {
        console.log("  No device action — skipping");
        lastAction = null;
      } else if (deviceOps.length > 1) {
        console.log(`  Warning: ${String(deviceOps.length)} device actions, using last one`);
      }

      if (deviceAction) {
        if (deviceAction.toolName === "exit") {
          console.log("\nExploration complete.");
          break;
        }

        try {
          if (deviceAction.toolName === "tap") {
            const args = deviceAction.input as { x: number; y: number };
            await tap(browser, args.x, args.y);
            lastAction = `tap(${String(args.x)}, ${String(args.y)})`;
          } else if (deviceAction.toolName === "pressBack") {
            await pressBack(browser);
            lastAction = "pressBack";
          } else if (deviceAction.toolName === "scroll") {
            const args = deviceAction.input as { direction: "up" | "down" };
            await scroll(browser, args.direction);
            lastAction = `scroll(${args.direction})`;
          }
          console.log(`  Action: ${String(lastAction)}`);
        } catch (error) {
          console.error("Device action failed:", error);
          throw error;
        }
      }

      // Wait for UI to settle
      await new Promise((resolve) => setTimeout(resolve, 1000));

      screenshot = await takeScreenshot(browser);
      step++;
      if (addedNodes) {
        staleCount = 0;
      } else {
        staleCount++;
      }
    }

    if (step >= maxSteps) console.log("\nReached max steps limit.");
    if (staleCount >= staleLimit) console.log("\nReached stale limit.");
  } finally {
    await destroySession(browser);
  }

  await mkdir("output", { recursive: true });
  await writeFile("output/graph.json", serialize(graph));
  console.log(`\nGraph saved to output/graph.json`);
  console.log(`  ${String(graph.nodes.length)} nodes, ${String(graph.edges.length)} edges`);

  const totalTokens = totalInputTokens + totalOutputTokens;
  console.log(
    `\nToken usage: ${String(totalInputTokens)} input + ${String(totalOutputTokens)} output = ${String(totalTokens)} total`,
  );
  if (pricing) {
    const cost =
      (totalInputTokens / 1_000_000) * pricing.inputPerMToken +
      (totalOutputTokens / 1_000_000) * pricing.outputPerMToken;
    console.log(`Estimated cost: $${cost.toFixed(4)}`);
  }

  return graph;
}
