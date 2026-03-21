import { generateText, hasToolCall, stepCountIs, type LanguageModel, type ModelMessage } from "ai";
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
import { writeFile, mkdir, rm } from "node:fs/promises";

interface ExploreOptions {
  maxSteps: number;
  model: LanguageModel;
  modelId: string;
}

export async function explore({ maxSteps, model, modelId }: ExploreOptions): Promise<Graph> {
  const pricing = MODEL_PRICING[modelId] as
    | { inputPerMToken: number; outputPerMToken: number; thinkingPerMToken: number }
    | undefined;
  const browser = await createSession(env.APPIUM_URL);
  const graph = createGraph();
  const tools = createTools(graph);

  let step = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalThinkingTokens = 0;
  let prevUserContent: { type: "text"; text: string }[] | null = null;
  let prevResponseMessages: ModelMessage[] | null = null;
  let screenshot = await takeScreenshot(browser);
  let elements = await getInteractiveElements(browser);

  await rm("output", { recursive: true, force: true });
  await mkdir("output/screenshots", { recursive: true });

  console.log("\nStarting exploration...\n\n");

  try {
    while (step < maxSteps) {
      console.log(`--- Step ${String(step + 1)}/${String(maxSteps)} ---`);

      const elementListText = formatElementList(elements);
      const prevNodeCount = graph.nodes.length;

      const currentText = `Current graph:\n${serialize(graph)}\n\nInteractive elements:\n${elementListText}`;
      const currentUserContent: { type: "text"; text: string }[] = [
        { type: "text" as const, text: currentText },
      ];

      const messages: ModelMessage[] = [];
      if (prevUserContent && prevResponseMessages) {
        const prevText =
          step >= 2
            ? `[Earlier exploration history truncated. The graph contains all discoveries.]\n\n${prevUserContent[0].text}`
            : prevUserContent[0].text;
        messages.push({
          role: "user" as const,
          content: [{ type: "text" as const, text: prevText }],
        });
        messages.push(...prevResponseMessages);
      }
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
        },
      });

      const inputTokens = result.totalUsage.inputTokens ?? 0;
      const thinkingTokens = result.totalUsage.outputTokenDetails.reasoningTokens ?? 0;
      const outputTokens = (result.totalUsage.outputTokens ?? 0) - thinkingTokens;
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      totalThinkingTokens += thinkingTokens;

      console.log(`Reasoning:\n"""\n${result.reasoningText ?? ""}\n"""`);
      console.log(`Text: "${result.text}"`);

      const allToolCalls = result.steps.flatMap((s) => s.toolCalls);
      if (allToolCalls.length > 0) {
        console.log(
          `Tool calls:\n    ${allToolCalls.map((tc) => `${tc.toolName}(${JSON.stringify(tc.input)})`).join("\n    ")}`,
        );
      }

      // Save screenshots for any new nodes created this step
      for (let i = prevNodeCount; i < graph.nodes.length; i++) {
        await writeFile(
          `output/screenshots/${graph.nodes[i].id}.png`,
          Buffer.from(screenshot, "base64"),
        );
      }
      await writeFile("output/graph.json", serialize(graph));

      // Check for exit across all steps
      const exitCalled = result.steps.some((s) => s.toolCalls.some((tc) => tc.toolName === "exit"));
      if (exitCalled) {
        console.log("--- Exploration complete ---");
        break;
      }

      // Execute tap actions
      let tapped = false;
      for (const s of result.steps) {
        for (const tc of s.toolCalls) {
          if (tc.toolName === "tap") {
            const args = tc.input as { elementIndex: number };
            await tapElement(browser, elements, args.elementIndex);
            const el = elements[args.elementIndex];
            console.log(`Action: Tapped [${String(args.elementIndex)}] "${el.label}"`);
            tapped = true;
          }
        }
      }

      if (!tapped) {
        console.log("No device action");
      }

      // Save previous turn for sliding window context
      prevUserContent = currentUserContent;
      prevResponseMessages = result.response.messages;

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
