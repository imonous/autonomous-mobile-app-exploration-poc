# PoC Plan: Autonomous Mobile App Exploration

## Goal

Autonomously explore an Android app and produce a graph of discovered screens and the actions that transition between them.

## Scope

PoC only. A working exploration loop that produces a meaningful graph for Google Clock (preinstalled on Android emulators, no auth, standard material UI, ~10-20 distinct screens).

## Architecture

**App interface** — Appium session controlling an Android emulator. Provides observations of the current app state and executes actions on the device.

**Agent loop** — Repeatedly presents app state to an LLM, receives a chosen action via tool calls, executes it, and records the transition. Built with Vercel AI SDK.

**Graph** — The LLM maintains a state graph as it explores. It labels screens, decides whether the current screen is new or previously visited, and records transitions as edges. The graph is the primary output.

## Tech stack

- Node.js / TypeScript
- Vercel AI SDK
- Appium (Android emulator)
