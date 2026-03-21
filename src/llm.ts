import { tool } from "ai";
import { z } from "zod/v4";
import { addNode, addEdge, type Graph } from "./graph.js";

export interface Pricing {
  inputPerMToken: number;
  outputPerMToken: number;
}

export const MODEL_PRICING: Record<string, Pricing> = {
  "gemini-3-flash-preview": { inputPerMToken: 0.1, outputPerMToken: 0.4 },
};

export const DEVICE_TOOL_NAMES = ["tap", "exit"] as const;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createTools(graph: Graph) {
  return {
    addNode: tool({
      description:
        "Register a new screen in the graph. Call this when the current screenshot shows a screen not yet in the graph. Returns the new node's ID.",
      inputSchema: z.object({
        description: z
          .string()
          .describe(
            "Description of the screen. Capture: the screen title or header text, " +
              "all visible interactive elements (buttons, tabs, inputs, list items), " +
              "visual state (which tab is selected, toggle positions, badge counts), " +
              "and any overlays such as modals, bottom sheets, or dialogs.",
          ),
      }),
      execute: ({ description }) => Promise.resolve(addNode(graph, description)),
    }),

    addEdge: tool({
      description:
        "Record a transition between two screens. Call this after performing a device action that moved from one known screen to another.",
      inputSchema: z.object({
        from: z.string().describe("Source node ID (e.g. screen_0)"),
        to: z.string().describe("Destination node ID (e.g. screen_1)"),
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
        "Signal that exploration is complete. Call this when you believe all reachable screens and transitions have been discovered.",
      inputSchema: z.object({}),
      execute: () => Promise.resolve("ok"),
    }),
  };
}

export const SYSTEM_PROMPT = `You are an autonomous Android app explorer. Your job is to systematically explore every screen and interaction in the app, building a graph of screens (nodes) and transitions (edges).

## What you see each turn
- The current exploration graph (JSON with nodes and edges)
- A screenshot of the current app screen
- The last device action you took (if any)

## Rules
1. Each turn, you may call graph mutation tools (addNode, addEdge) and then exactly ONE device action (tap or exit).
2. addNode returns the new node's ID — use it in subsequent addEdge calls.
3. When you see a screen for the first time, call addNode to register it BEFORE taking a device action.
4. After a device action transitions you to a different screen, record the transition with addEdge on the NEXT turn (when you can see the result).
5. The app is pinned — you cannot leave it. Do not try to go to the home screen.
6. Call exactly one device tool (tap or exit) when you are done with graph operations.

## Strategy
- Explore systematically: try every visible button, tab, menu item, and interactive element.
- Prefer unexplored areas over revisiting known screens.
- When you have thoroughly explored all reachable screens, call exit.

## Interactive elements
Each turn you receive a numbered list of interactive (tappable) elements parsed from the screen's UI tree. Use \`tap({ elementIndex })\` with the element's index to tap it. Do NOT guess pixel coordinates.`;
