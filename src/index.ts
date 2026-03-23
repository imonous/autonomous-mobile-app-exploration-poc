import { google } from "@ai-sdk/google";
// import { anthropic } from "@ai-sdk/anthropic";
import { explore } from "./orchestrator.js";

// const modelId = "claude-sonnet-4-6";
// const model = anthropic(modelId);

const modelId = "gemini-3-flash-preview";
const model = google(modelId);

/* Full crawl */

// await explore({
//   maxSteps: 300,
//   model,
//   modelId,
//   // The embedded apps for some reason don't get prevented by pin
//   excludeElements: [
//     "Add new", // Opens Files in embedded mode
//     "Google Assistant Routine", // Opens another app in embedded mode
//     "Screen saver", // Results in a screan with 0 interaction
//     "Help", // Opens some help center in embedded mode
//     "Bedtime", // Most of the interactions here open apps in embedded mode
//   ],
// });

/* Clock tab crawl */

await explore({
  maxSteps: 150,
  model,
  modelId,
  // The embedded apps for some reason don't get prevented by pin
  excludeElements: [
    "Add new", // Opens Files in embedded mode
    "Google Assistant Routine", // Opens another app in embedded mode
    "Screen saver", // Results in a screan with 0 interaction
    "Help", // Opens some help center in embedded mode
    "Alarm",
    "Timer",
    "Stopwatch",
    "Bedtime",
  ],
});
