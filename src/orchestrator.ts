import { generateText, hasToolCall, stepCountIs, type LanguageModel, type ModelMessage } from "ai";
import { createGraph, serialize, allExplored, printChecklist, type Graph } from "./graph.js";
import {
  createSession,
  destroySession,
  takeScreenshot,
  getInteractiveElements,
  formatElementList,
  tapElement,
  pressBack,
} from "./device.js";
import { createTools, DEVICE_TOOL_NAMES, SYSTEM_PROMPT, MODEL_PRICING } from "./llm.js";
import { env } from "./env.js";
import { writeFile, mkdir, rm } from "node:fs/promises";

interface ExploreOptions {
  maxSteps: number;
  model: LanguageModel;
  modelId: string;
  excludeElements?: string[];
}

export async function explore({
  maxSteps,
  model,
  modelId,
  excludeElements,
}: ExploreOptions): Promise<Graph> {
  const pricing = MODEL_PRICING[modelId] as
    | { inputPerMToken: number; outputPerMToken: number; thinkingPerMToken: number }
    | undefined;
  const browser = await createSession(env.APPIUM_URL);
  const graph = createGraph();

  let step = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalThinkingTokens = 0;
  interface HistoryEntry {
    responseMessages: ModelMessage[];
    screenshot: string;
  }
  const history: HistoryEntry[] = [];
  let [screenshot, elements] = await Promise.all([
    takeScreenshot(browser),
    getInteractiveElements(browser),
  ]);

  await rm("output", { recursive: true, force: true });
  await mkdir("output/screenshots", { recursive: true });

  console.log("\nStarting exploration...");

  try {
    while (step < maxSteps) {
      console.log(`\n--- Step ${String(step + 1)}/${String(maxSteps)} ---`);
      printChecklist(graph);

      if (elements.length === 0) {
        console.log("No interactive elements found — pressing back to dismiss");
        await pressBack(browser);
        await new Promise((resolve) => setTimeout(resolve, 500));
        [screenshot, elements] = await Promise.all([
          takeScreenshot(browser),
          getInteractiveElements(browser),
        ]);
        step++;
        continue;
      }

      const visible = excludeElements
        ? elements.filter((el) => !excludeElements.some((ex) => el.label.includes(ex)))
        : elements;
      const tools = createTools(graph);
      const elementListText = formatElementList(visible);
      const prevNodeCount = graph.nodes.length;

      const currentText = `Current graph:\n${serialize(graph)}\n\nInteractive elements:\n${elementListText}`;
      const currentUserContent: { type: "text"; text: string }[] = [
        { type: "text" as const, text: currentText },
      ];

      const messages: ModelMessage[] = [];

      // Sentinel for anything older than our window
      if (history.length > 4) {
        messages.push({
          role: "user" as const,
          content: [{ type: "text" as const, text: "[History truncated]" }],
        });
      }

      // Past turns (up to last 4)
      const window = history.slice(-4);
      for (let i = 0; i < window.length; i++) {
        const entry = window[i];
        const isLatest = i === window.length - 1;

        const userContent: (
          | { type: "text"; text: string }
          | { type: "image"; image: string; mediaType: "image/png" }
        )[] = [{ type: "text" as const, text: "[Truncated]" }];
        if (isLatest) {
          userContent.push({
            type: "image" as const,
            image: entry.screenshot,
            mediaType: "image/png" as const,
          });
        }

        messages.push({ role: "user" as const, content: userContent });
        messages.push(...entry.responseMessages);
      }

      // Current turn — full graph + elements + screenshot
      messages.push({
        role: "user" as const,
        content: [
          ...currentUserContent,
          {
            type: "image" as const,
            image: screenshot,
            mediaType: "image/png" as const,
          },
        ],
      });

      const result = await generateText({
        model,
        system: SYSTEM_PROMPT,
        messages,
        tools,
        stopWhen: [...DEVICE_TOOL_NAMES.map((name) => hasToolCall(name)), stepCountIs(10)],
        providerOptions: {
          google: {
            thinkingConfig: {
              thinkingLevel: "high",
              includeThoughts: true,
            },
          },
          anthropic: {
            thinking: { type: "adaptive" },
            effort: "high",
          },
        },
      });

      const inputTokens = result.totalUsage.inputTokens ?? 0;
      const thinkingTokens = result.totalUsage.outputTokenDetails.reasoningTokens ?? 0;
      const outputTokens = (result.totalUsage.outputTokens ?? 0) - thinkingTokens;
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      totalThinkingTokens += thinkingTokens;

      if (result.reasoningText) {
        console.log(`\n\x1b[2m${result.reasoningText.trim()}\x1b[0m\n`);
      }
      if (result.text) console.log(result.text.trim());

      for (const s of result.steps) {
        if (s.toolCalls.length > 0) {
          const formatted = s.toolCalls
            .map((tc) => `${tc.toolName}(${JSON.stringify(tc.input, null, 2)})`)
            .join(", ");
          console.log(formatted);
        }
      }
      // Save screenshots for any new nodes created this step
      for (let i = prevNodeCount; i < graph.nodes.length; i++) {
        await writeFile(
          `output/screenshots/${graph.nodes[i].id}.png`,
          Buffer.from(screenshot, "base64"),
        );
      }
      await writeFile("output/graph.json", serialize(graph));

      // Give the visualizer time to poll the new node before navigating away
      if (graph.nodes.length > prevNodeCount) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Execute tap actions
      for (const s of result.steps) {
        for (const tr of s.toolResults) {
          if (tr.toolName === "tap" && tr.output === "ok") {
            const args = tr.input as { elementIndex: number };
            try {
              await tapElement(browser, visible, args.elementIndex);
            } catch (e) {
              console.error(`Tap failed: ${(e as Error).message}`);
            }
          }
        }
      }

      if (allExplored(graph) && step > 0) {
        console.log("--- Exploration complete (all checklist elements explored) ---");
        break;
      }

      // Save turn for sliding window context
      history.push({
        responseMessages: result.response.messages,
        screenshot,
      });

      // Wait for UI to settle
      await new Promise((resolve) => setTimeout(resolve, 500));

      [screenshot, elements] = await Promise.all([
        takeScreenshot(browser),
        getInteractiveElements(browser),
      ]);
      step++;
    }

    if (step >= maxSteps) console.log("--- Reached max steps limit ---");
  } finally {
    await destroySession(browser);
  }

  console.log(`Graph saved to output/graph.json`);
  console.log(`    ${String(graph.nodes.length)} nodes, ${String(graph.edges.length)} edges`);

  const totalTokens = totalInputTokens + totalOutputTokens + totalThinkingTokens;
  console.log(
    `\nToken usage: ${String(totalInputTokens)} input + ${String(totalOutputTokens)} output + ${String(totalThinkingTokens)} thinking = ${String(totalTokens)} total`,
  );
  if (pricing) {
    const cost =
      (totalInputTokens / 1_000_000) * pricing.inputPerMToken +
      (totalOutputTokens / 1_000_000) * pricing.outputPerMToken +
      (totalThinkingTokens / 1_000_000) * pricing.thinkingPerMToken;
    console.log(`Cost: $${cost.toFixed(4)}`);
  }

  return graph;
}
