# Approach 1: Unified Graph-as-History

## Core idea

The LLM both navigates the app and builds the graph. The graph is the primary output _and_ the LLM's memory of what it has explored. There is no separate history mechanism — the graph _is_ the history.

## Components

Four disjoint components:

1. **LLM orchestrator** — the loop. Builds the prompt, makes the LLM call, dispatches tool results, checks termination conditions.
2. **Graph store** — holds nodes and edges. Serializes to text for the prompt, applies mutations from tool calls. Immutable append-only: the LLM can only add nodes and edges, never modify or delete.
3. **Tool definitions** — the schema the LLM sees. `addNode`, `addEdge`, `tap`, `pressBack`, `scroll`, `exit`.
4. **Appium adapter** — takes action calls (`tap(x, y)`, `pressBack`, etc.), executes them via WebDriver, returns a screenshot.

## Turn structure

Each exploration step is a stateless single-turn LLM call. The graph and current observation are serialized fresh each turn:

    System: You are exploring an Android app. [instructions, tool definitions]

    User:
      Current graph: { nodes: [...], edges: [...] }
      Screenshot: <image>

    Assistant:
      Thinking: "I see the alarm list screen. The graph already has this as node_0.
                 I haven't explored the + button yet, I'll tap it to discover the
                 create-alarm flow."
      Tool calls: addNode(...), tap(x, y)

The LLM reads the full graph, sees the current screenshot, reasons about what to do in a `thinking` block, then makes tool calls. Next step, the loop serializes the updated graph again from scratch.

**One device action per turn, always last.** Each turn ends with exactly one device action (`tap`, `pressBack`, `scroll`, or `exit`). Graph mutations (`addNode`, `addEdge`) are optional and come before the device action. The orchestrator executes the device action, captures a new screenshot, and starts the next turn.

## Graph structure

Nodes and edges are append-only data structures, updated by the LLM via tool calls.

**Node**: a screen the LLM has identified. Contains a 1-2 sentence summary of the screen's content (e.g. "The home page. It has buttons X, Y, Z.").

**Edge**: a transition between two nodes. Contains a natural-language description of how the LLM got there (e.g. "Clicked button X").

The graph stays small (text labels, not screenshots) and fits comfortably in context for a PoC-scale app.

## Tool definitions (sketch)

- `addNode({ summary })` — register a new screen. Returns the assigned node ID.
- `addEdge({ from, to, action })` — record a transition between two screens.
- `tap({ x, y })` — tap coordinates on the device screen.
- `pressBack()` — press the Android back button.
- `scroll({ direction })` — scroll up/down.
- `exit()` — signal exploration is complete.

Every turn, the LLM first outputs plain text justifying its next action, then makes tool calls. Both are logged together as one exploration step.

## Observation strategy

Screenshot-only. The screenshot is the primary observation — cheap in tokens, carries full visual context for screen identity and navigation decisions.

No screenshot resizing — raw Appium screenshots sent directly. Coordinates map 1:1 to device.

## Termination

- Hard cap of N total steps.
- Stop if no new nodes discovered in the last K steps.
- The LLM can call `exit()` when it judges exploration is complete.

## Screen identity

The LLM decides whether the current screenshot represents a new screen or a previously visited one. This is inherently fuzzy (dialogs, scroll positions, dynamic data). For the PoC, we accept that duplicates may occur and address this if it becomes a problem.

## Why unified

Graph building requires judgment (screen identity is fuzzy), so the LLM must do it. Since the LLM builds the graph anyway, the graph doubles as its exploration memory — no need to solve history separately.

This also aligns with how tool-use models work: receive structured state, pick an action, see the result. Stateless single-turn calls with reconstructed state avoid context window rot, instruction-following drift, and forgotten context.

## Potential additions (post-PoC)

- **Action history**: visit counts on nodes, timestamps on edges, or a short `recentActions` list to help the LLM avoid loops.
- **XML UI tree**: add a flat list of clickable elements with text + bounds as a secondary input if coordinate-based taps prove unreliable.
- **Error handling / recovery**: handle taps that go nowhere, app crashes, transition-frame screenshots.
- **Graph scaling**: for larger apps, selective graph serialization instead of always-in-context.
