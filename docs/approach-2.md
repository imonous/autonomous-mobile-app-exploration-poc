# Approach 2: Unified Graph-as-History with Structured UI Parsing

## Core idea

The LLM both navigates the app and builds the graph. The graph is the primary output _and_ the LLM's memory of what it has explored. There is no separate history mechanism — the graph _is_ the history.

The LLM never guesses where to tap. Each turn, the system parses the screen's XML UI tree into a numbered list of interactive elements. The LLM picks an element by index, and the system computes the tap coordinates from the element's bounds. This decouples navigation decisions (LLM) from pixel-level execution (system).

## Components

Four disjoint components:

1. **LLM orchestrator** — the loop. Builds the prompt, makes the LLM call, dispatches tool results, checks termination conditions.
2. **Graph store** — holds nodes and edges. Serializes to JSON for the prompt, applies mutations from tool calls. Append-only: the LLM can only add nodes and edges, never modify or delete.
3. **Tool definitions** — the schema the LLM sees. `addNode`, `addEdge`, `tap`, `exit`. Tool functions wire directly to graph and device modules — no orchestrator-level dispatch.
4. **Appium adapter** — manages the device session, takes screenshots, parses the XML UI tree into interactive elements, and executes taps by computing center coordinates from element bounds.

## Turn structure

Each exploration step is a stateless single-turn LLM call. The graph, interactive elements, and current screenshot are serialized fresh each turn:

    System: You are exploring an Android app. [instructions, tool definitions]

    User:
      Current graph: { nodes: [...], edges: [...] }
      Last action: Tapped [3] "Timer tab"
      Interactive elements:
        [0] "8:30 AM alarm" [0,200][1080,350]
        [1] "Settings" [900,50][1080,120]
        ...
      Screenshot: <image>

    Assistant:
      Thinking: "I see the timer screen. This is new — I'll register it as a node
                 and record the edge from the alarm screen. Then I'll tap the
                 stopwatch tab to continue exploring."
      Tool calls: addNode(...), addEdge(...), tap({ elementIndex: 4 })

The LLM reads the full graph, sees the interactive elements and screenshot, reasons in a thinking block, then makes tool calls. The AI SDK's multi-step tool calling handles graph mutations automatically, stopping when a device tool (`tap` or `exit`) is called. Next step, the loop serializes the updated graph again from scratch.

**One device action per turn, always last.** Each turn ends with exactly one device action (`tap` or `exit`). Graph mutations (`addNode`, `addEdge`) are optional and come before the device action. The orchestrator executes the device action, captures a new screenshot and fresh element list, and starts the next turn.

## Graph structure

Nodes and edges are append-only data structures, updated by the LLM via tool calls.

**Node**: a screen the LLM has identified. Contains a description of the screen's content — title/header text, interactive elements, visual state (selected tabs, toggle positions), and any overlays (modals, bottom sheets, dialogs).

**Edge**: a transition between two nodes. Contains a natural-language description of what caused the transition (e.g. "Tapped 'Timer' tab").

The graph stays small (text labels, not screenshots) and fits comfortably in context for a PoC-scale app.

## Tool definitions

- `addNode({ description })` — register a new screen. Returns the assigned node ID.
- `addEdge({ from, to, action })` — record a transition between two screens.
- `tap({ elementIndex })` — tap an interactive element by its index from the element list.
- `exit()` — signal exploration is complete.

Every turn, the LLM first reasons about its next action in a thinking block, then makes tool calls.

## Observation strategy

**Dual input: screenshot + parsed UI tree.** The screenshot provides full visual context for screen identity and layout understanding. The XML UI tree, parsed into a flat numbered list of interactive elements with labels and bounds, provides structured, reliable targets for navigation.

Interactive elements are extracted from the Android UI hierarchy XML (via Appium's `getPageSource`). An element is included if it is both `clickable="true"` and `enabled="true"` and has non-zero-area bounds. Labels are derived from `text`, `content-desc`, or `resource-id` attributes, in that priority order.

No screenshot resizing — raw Appium screenshots sent directly.

## Tap execution

The LLM never produces pixel coordinates. It calls `tap({ elementIndex })`, and the system:

1. Looks up the element's bounds from the parsed list.
2. Computes the center point: `x = (left + right) / 2`, `y = (top + bottom) / 2`.
3. Executes a touch action at those coordinates via Appium.

This eliminates coordinate hallucination and makes taps reliable regardless of screen density or resolution.

## Termination

- Hard cap of N total steps.
- The LLM can call `exit()` when it judges exploration is complete.

## Screen identity

The LLM decides whether the current screenshot represents a new screen or a previously visited one. This is inherently fuzzy (dialogs, scroll positions, dynamic data). For the PoC, we accept that duplicates may occur and address this if it becomes a problem.

## Why this structure

Graph building requires judgment (screen identity is fuzzy), so the LLM must do it. Since the LLM builds the graph anyway, the graph doubles as its exploration memory — no need to solve history separately.

Structured element parsing means the LLM reasons about _what_ to interact with (semantic choice) while the system handles _how_ (pixel coordinates). This separation makes taps reliable and removes an entire class of failures (mis-estimated coordinates, density-dependent offsets).

Stateless single-turn calls with reconstructed state avoid context window rot, instruction-following drift, and forgotten context.

## Potential additions

- **Error handling / recovery**: handle taps that go nowhere, app crashes, transition-frame screenshots.
