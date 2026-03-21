import { tool } from "ai";
import { z } from "zod/v4";

export interface Pricing {
  inputPerMToken: number;
  outputPerMToken: number;
}

export const MODEL_PRICING: Record<string, Pricing> = {
  "gemini-3-flash-preview": { inputPerMToken: 0.1, outputPerMToken: 0.4 },
};

export const tools = {
  addNode: tool({
    description:
      "Register a new screen in the graph. Call this when the current screenshot shows a screen not yet in the graph.",
    inputSchema: z.object({
      summary: z.string().describe("1-2 sentence description of the screen content and purpose"),
    }),
  }),

  addEdge: tool({
    description:
      "Record a transition between two screens. Call this after performing a device action that moved from one known screen to another.",
    inputSchema: z.object({
      from: z.string().describe("Source node ID (e.g. screen_0)"),
      to: z.string().describe("Destination node ID (e.g. screen_1)"),
      action: z.string().describe("What caused the transition (e.g. \"Tapped 'Timer' tab\")"),
    }),
  }),

  tap: tool({
    description:
      "Tap a point on the screen. Coordinates are pixels relative to the screenshot (top-left = 0,0).",
    inputSchema: z.object({
      x: z.number().describe("X coordinate in pixels"),
      y: z.number().describe("Y coordinate in pixels"),
    }),
  }),

  pressBack: tool({
    description: "Press the Android back button. Use this to return to a previous screen.",
    inputSchema: z.object({}),
  }),

  scroll: tool({
    description: "Scroll the screen to reveal more content.",
    inputSchema: z.object({
      direction: z.enum(["up", "down"]).describe("Scroll direction"),
    }),
  }),

  exit: tool({
    description:
      "Signal that exploration is complete. Call this when you believe all reachable screens and transitions have been discovered.",
    inputSchema: z.object({}),
  }),
};

export const SYSTEM_PROMPT = `You are an autonomous Android app explorer. Your job is to systematically explore every screen and interaction in the app, building a graph of screens (nodes) and transitions (edges).

## What you see each turn
- The current exploration graph (JSON with nodes and edges)
- A screenshot of the current app screen
- The last device action you took (if any)

## Rules
1. Each turn, you may call graph mutation tools (addNode, addEdge) followed by exactly ONE device action (tap, pressBack, scroll, or exit). Graph mutations come first, device action last.
2. Node IDs are sequential: the next ID is always screen_N where N = current number of nodes in the graph.
3. When you see a screen for the first time, call addNode to register it BEFORE taking a device action.
4. After a device action transitions you to a different screen, record the transition with addEdge on the NEXT turn (when you can see the result).
5. The app is pinned — you cannot leave it. Do not try to go to the home screen.

## Strategy
- Explore systematically: try every visible button, tab, menu item, and interactive element.
- Prefer unexplored areas over revisiting known screens.
- Use pressBack to return from dead ends or deep screens.
- Use scroll to reveal content that might be below the fold.
- When you have thoroughly explored all reachable screens, call exit.

## Thinking
Before making tool calls, justify your next action as text.

## Coordinates
Tap coordinates are in pixels relative to the screenshot image. Top-left corner is (0, 0).`;
