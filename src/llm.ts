import { tool } from "ai";
import { z } from "zod/v4";
import { addNode, addEdge, type Graph } from "./graph.js";

export interface Pricing {
  inputPerMToken: number;
  outputPerMToken: number;
  thinkingPerMToken: number;
}

export const MODEL_PRICING: Record<string, Pricing> = {
  "gemini-3-flash-preview": { inputPerMToken: 0.5, outputPerMToken: 3.0, thinkingPerMToken: 3.0 },
};

export const DEVICE_TOOL_NAMES = ["tap", "exit"] as const;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createTools(graph: Graph) {
  return {
    addNode: tool({
      description:
        "Register a new view in the graph. Call this when the current screenshot shows a view not yet in the graph. Returns the new node's ID.",
      inputSchema: z.object({
        description: z.string().describe(
          "Description of the view. Capture: the screen title or header text, " +
            "all visible interactive elements (buttons, tabs, inputs, list items), " +
            "and any overlays such as modals, bottom sheets, or dialogs.", // TODO
        ),
      }),
      execute: ({ description }) => Promise.resolve(addNode(graph, description)),
    }),

    addEdge: tool({
      description: "Record a transition between two views.",
      inputSchema: z.object({
        from: z.string().describe("Source node ID (e.g. view_0)"),
        to: z.string().describe("Destination node ID (e.g. view_1)"),
        action: z.string().describe("What caused the transition (e.g. \"Tapped 'Timer' tab\")"),
      }),
      execute: ({ from, to, action }) => {
        addEdge(graph, from, to, action);
        return Promise.resolve("ok");
      },
    }),

    tap: tool({
      description: "Tap an interactive element on screen by its index from the element list.",
      inputSchema: z.object({
        elementIndex: z
          .number()
          .describe("Index of the element to tap from the interactive elements list"),
      }),
      execute: () => Promise.resolve("ok"),
    }),

    exit: tool({
      description:
        "Signal that exploration is complete. Call this when you believe all reachable views and transitions have been discovered.",
      inputSchema: z.object({}),
      execute: () => Promise.resolve("ok"),
    }),
  };
}

export const SYSTEM_PROMPT = `You are an autonomous Android app explorer. Your job is to systematically explore every view and interaction in the app, building a graph of views (nodes) and transitions (edges).

## When to add a node
A node represents a visually distinct view — not every minor content change.

Add a new node when:
- You navigate to a different page
- A modal, bottom sheet, or dialog appears
- A menu or dropdown opens revealing new interactive elements

Do NOT add a new node when:
- A text field value changes
- A loading spinner appears/disappears
- Content refreshes but the layout and available interactions stay the same

## Notes
1. Each turn, you may call at most ONE device action (tap, exit).
2. Always add nodes and edges first, before taking a device action (tap, exit).
3. Screenshots from older turns are truncated.

## Strategy
- Use depth-first exploration: when you reach a new view, go deeper before exploring siblings.
- Backtrack when you hit a dead end or an already-known view.
- When you have thoroughly explored all reachable views, call exit.`;
