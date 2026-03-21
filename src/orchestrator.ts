import { generateText, hasToolCall, stepCountIs, type LanguageModel } from "ai";
import { createGraph, serialize, type Graph } from "./graph.js";
import { createSession, destroySession, takeScreenshot } from "./device.js";
import { createTools, DEVICE_TOOL_NAMES, SYSTEM_PROMPT, MODEL_PRICING } from "./llm.js";
import { env } from "./env.js";
import { writeFile, mkdir } from "node:fs/promises";

interface ExploreOptions {
  maxSteps: number;
  model: LanguageModel;
  modelId: string;
}

export async function explore({ maxSteps, model, modelId }: ExploreOptions): Promise<Graph> {
  const pricing = MODEL_PRICING[modelId] as
    | { inputPerMToken: number; outputPerMToken: number }
    | undefined;
  const browser = await createSession(env.APPIUM_URL);
  const graph = createGraph();
  const tools = createTools(graph, browser);

  let step = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastAction: string | null = null;
  let screenshot = await takeScreenshot(browser);

  console.log("\nStarting exploration...\n");

  try {
    while (step < maxSteps) {
      console.log(`\n--- Step ${String(step + 1)}/${String(maxSteps)} ---\n`);

      const result = await generateText({
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
        stopWhen: [...DEVICE_TOOL_NAMES.map((name) => hasToolCall(name)), stepCountIs(10)],
        providerOptions: {
          google: {
            thinkingConfig: {
              thinkingLevel: "high",
              includeThoughts: true,
            },
          },
        },
      });

      const inputTokens = result.totalUsage.inputTokens ?? 0;
      const outputTokens = result.totalUsage.outputTokens ?? 0;
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;

      console.log(`Reasoning: ${result.reasoningText ?? ""}\n`);
      console.log(`Text: ${result.text}\n`);

      for (const s of result.steps) {
        if (s.toolCalls.length > 0) {
          console.log(
            `Tool calls:\n\t${s.toolCalls.map((tc) => `${tc.toolName}(${JSON.stringify(tc.input)})`).join("\n\t")}\n`,
          );
        }
      }

      // Check for exit across all steps
      const exitCalled = result.steps.some((s) => s.toolCalls.some((tc) => tc.toolName === "exit"));
      if (exitCalled) {
        console.log("\n--- Exploration complete ---\n");
        break;
      }

      // Derive lastAction from the terminal device tool call
      lastAction = null;
      for (const s of result.steps) {
        for (const tc of s.toolCalls) {
          if (tc.toolName === "tap") {
            const args = tc.input as { x: number; y: number };
            lastAction = `tap(${String(args.x)}, ${String(args.y)})`;
          }
        }
      }

      if (lastAction) {
        console.log(`    Action: ${lastAction}`);
      } else {
        console.log("    No device action");
      }

      // Wait for UI to settle
      await new Promise((resolve) => setTimeout(resolve, 1000));

      screenshot = await takeScreenshot(browser);
      step++;
    }

    if (step >= maxSteps) console.log("\n--- Reached max steps limit ---\n");
  } finally {
    await destroySession(browser);
  }

  await mkdir("output", { recursive: true });
  await writeFile("output/graph.json", serialize(graph));
  console.log(`Graph saved to output/graph.json`);
  console.log(`    ${String(graph.nodes.length)} nodes, ${String(graph.edges.length)} edges`);

  const totalTokens = totalInputTokens + totalOutputTokens;
  console.log(
    `\nToken usage: ${String(totalInputTokens)} input + ${String(totalOutputTokens)} output = ${String(totalTokens)} total`,
  );
  if (pricing) {
    const cost =
      (totalInputTokens / 1_000_000) * pricing.inputPerMToken +
      (totalOutputTokens / 1_000_000) * pricing.outputPerMToken;
    console.log(`Estimated cost: $${cost.toFixed(4)}\n`);
  }

  return graph;
}
