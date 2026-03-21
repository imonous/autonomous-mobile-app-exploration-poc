import { generateText, hasToolCall, stepCountIs, type LanguageModel } from "ai";
import { createGraph, serialize, type Graph } from "./graph.js";
import {
  createSession,
  destroySession,
  takeScreenshot,
  getInteractiveElements,
  formatElementList,
  tapElement,
} from "./device.js";
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
  const tools = createTools(graph);

  let step = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastAction: string | null = null;
  let screenshot = await takeScreenshot(browser);
  let elements = await getInteractiveElements(browser);

  console.log("\nStarting exploration...\n\n");

  try {
    while (step < maxSteps) {
      console.log(`--- Step ${String(step + 1)}/${String(maxSteps)} ---`);

      const elementListText = formatElementList(elements);

      const result = await generateText({
        model,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text" as const,
                text: `Current graph:\n${serialize(graph)}${lastAction ? `\n\nLast action: ${lastAction}` : ""}\n\nInteractive elements:\n${elementListText}`,
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

      console.log(`Reasoning:\n"""\n${result.reasoningText ?? ""}\n"""`);
      console.log(`Text: "${result.text}"`);

      const allToolCalls = result.steps.flatMap((s) => s.toolCalls);
      if (allToolCalls.length > 0) {
        console.log(
          `Tool calls:\n    ${allToolCalls.map((tc) => `${tc.toolName}(${JSON.stringify(tc.input)})`).join("\n    ")}`,
        );
      }

      // Check for exit across all steps
      const exitCalled = result.steps.some((s) => s.toolCalls.some((tc) => tc.toolName === "exit"));
      if (exitCalled) {
        console.log("--- Exploration complete ---");
        break;
      }

      // Derive lastAction from the terminal device tool call and execute tap
      lastAction = null;
      for (const s of result.steps) {
        for (const tc of s.toolCalls) {
          if (tc.toolName === "tap") {
            const args = tc.input as { elementIndex: number };
            await tapElement(browser, elements, args.elementIndex);
            const el = elements[args.elementIndex];
            lastAction = `Tapped [${String(args.elementIndex)}] "${el.label}"`;
          }
        }
      }

      if (lastAction) {
        console.log(`Action: ${lastAction}`);
      } else {
        console.log("No device action");
      }

      // Wait for UI to settle
      await new Promise((resolve) => setTimeout(resolve, 1000));

      screenshot = await takeScreenshot(browser);
      elements = await getInteractiveElements(browser);
      step++;
    }

    if (step >= maxSteps) console.log("--- Reached max steps limit ---");
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
    console.log(`Cost: $${cost.toFixed(4)}`);
  }

  return graph;
}
