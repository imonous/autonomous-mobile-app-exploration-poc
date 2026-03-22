import { tool } from "ai";
import { z } from "zod/v4";
import { addNode, addEdge, addChecklistElements, markExplored, type Graph } from "./graph.js";

interface AddNodeResult {
  id: string;
  checklist: { id: string; label: string }[];
}

export interface Pricing {
  inputPerMToken: number;
  outputPerMToken: number;
  thinkingPerMToken: number;
}

export const MODEL_PRICING: Record<string, Pricing> = {
  "gemini-3-flash-preview": { inputPerMToken: 0.5, outputPerMToken: 3.0, thinkingPerMToken: 3.0 },
  "claude-sonnet-4-6-20260217": {
    inputPerMToken: 3.0,
    outputPerMToken: 15.0,
    thinkingPerMToken: 15.0,
  },
};

export const DEVICE_TOOL_NAMES = ["tap"] as const;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createTools(graph: Graph) {
  return {
    addNode: tool({
      description:
        "Register a new view in the graph. Call this when the current screenshot shows a view not yet in the graph. " +
        "Also populates the node's exploration checklist and optionally records the incoming edge. " +
        "Returns the new node's ID and checklist element IDs.",
      inputSchema: z.object({
        description: z
          .string()
          .describe(
            "Description of the view. Capture: the screen title/header, the types of UI components present " +
              "(buttons, tabs, inputs, lists), and the overall layout structure. " +
              "NEVER include displayed values, counts, text content, or data shown on screen " +
              "(e.g. 'Stopwatch screen with circular time display and start button' " +
              "NOT 'Stopwatch screen with 00:00.00 display').",
          ),
        checklist: z
          .array(z.string())
          .min(1)
          .describe(
            "Interactive elements to explore on this view. Only include elements currently visible on screen — the explorer cannot scroll. Use structural labels, not runtime values.",
          ),
        from: z.string().optional().describe("Source node ID if navigated here from another view"),
        action: z
          .string()
          .optional()
          .describe(
            "Human-readable label for the action, without context-specific details like element indices. " +
              "No runtime-specific values like times, amounts, or counts. " +
              "E.g. \"Tapped 'Settings'\"",
          ),
      }),
      execute: ({ description, checklist, from, action }): Promise<AddNodeResult> => {
        const id = addNode(graph, description);
        const checklistElements = addChecklistElements(graph, id, checklist);
        if (from && action) {
          addEdge(graph, from, id, action);
        }
        return Promise.resolve({ id, checklist: checklistElements });
      },
    }),

    addEdge: tool({
      description: "Record a transition between two views.",
      inputSchema: z.object({
        from: z.string().describe("Source node ID (e.g. view_0)"),
        to: z.string().describe("Destination node ID (e.g. view_1)"),
        action: z
          .string()
          .describe(
            "Human-readable label for the action, without context-specific details like element indices. " +
              "No runtime-specific values like times, amounts, or counts. " +
              "E.g. \"Tapped 'Timer' tab\"",
          ),
      }),
      execute: ({ from, to, action }) => {
        addEdge(graph, from, to, action);
        return Promise.resolve("ok");
      },
    }),

    tap: tool({
      description:
        "Tap an interactive element on screen by its index from the element list. " +
        "Optionally marks a checklist element as explored.",
      inputSchema: z.object({
        elementIndex: z
          .number()
          .describe("Index of the element to tap from the interactive elements list"),
        checklistElementId: z
          .string()
          .optional()
          .describe("Checklist element ID this tap explores. When provided, marks it as explored."),
      }),
      execute: ({ checklistElementId }) => {
        if (checklistElementId) {
          markExplored(graph, checklistElementId);
        }
        return Promise.resolve("ok");
      },
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
- Some value field changes (e.g. "00:00" -> "00:30" should NOT yield a new node), because it's a minor content change
- A loading spinner appears/disappears
- Content refreshes but the layout and available interactions stay the same

## Before adding a node
Before calling addNode, review every existing node in the graph. If the current screenshot matches an already-registered node (same layout and interactive elements, regardless of displayed data), do NOT create a duplicate — use addEdge to record the transition to the existing node instead.

## Notes
1. Each turn, you may call at most one tap.
2. Screenshots from older turns are truncated.
3. addNode already records the incoming edge — only use addEdge for edges between existing nodes.
4. When you navigate back to an already-known view, use addEdge to record the backward transition.
5. Elements marked (disabled) cannot be tapped. Mark their checklist entry as explored and move on.

## Checklist 
Exploration ends automatically when every checklist element is marked explored.
If a checklist element is no longer viable, you may discard it by marking as explored.

## Strategy
- Use depth-first exploration: when you reach a new view, go deeper before exploring siblings.
- When backtracking, always return to the nearest node with unexplored checklist elements before moving to a different branch.
- Backtrack when you hit a dead end or an already-known view.`;
