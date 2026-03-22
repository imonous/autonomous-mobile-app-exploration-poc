# Autonomous Mobile App Exploration

PoC: an LLM autonomously explores an Android app via Appium and builds a graph of screens and transitions.

Built as a PoC for the [bunq Software Project 2025-2026 Q4](docs/project-desc-past-poc.md).

## Demo

Test app: Google Clock (preinstalled on emulators, no auth, ~200 distinct views).

### Clock tab (~80 steps)

Scoped to one tab (other tabs disabled). Builds a near-complete map in under 100 steps.

<!-- TODO: replace with gif -->
![demo](TODO)

[Full video](TODO) · [Interactive graph](TODO)

### Full app (~300 steps)

Earlier run crawling all tabs. Works well for ~100 steps, then starts revisiting known screens.

[Interactive graph](TODO)

## How it works

Each step the LLM sees a screenshot and a list of tappable elements. It decides whether this is a new screen or one it's already visited, updates the graph, and picks what to tap next.

### The graph

The graph is the LLM's memory of what it has explored. It's built in real-time, one step at a time.

- **Nodes** = screens (pages, modals, menus, bottom sheets).
  Each node stores a short description of the screen's layout and structure.
- **Edges** = transitions between screens.
  Each edge is labeled with the action that caused it (e.g. "Tapped 'Settings'").

The full graph is sent to the LLM every step, so it always knows what it's already mapped.

### The checklist

When the LLM registers a new screen, it lists the elements that might lead somewhere new. As it taps through them, it marks them explored. Exploration ends when every item is covered.

## Limitations

- Tap only — no scroll, swipe, long-press, or back
- No login or user-state handling
- Degrades past ~100 steps (starts duplicating screens)
- Google Clock is likely in the model's training data
