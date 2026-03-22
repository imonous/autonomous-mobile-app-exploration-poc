import { google } from "@ai-sdk/google";
// import { anthropic } from "@ai-sdk/anthropic";
import { explore } from "./orchestrator.js";

const modelId = "gemini-3-flash-preview";
const model = google(modelId);
// const modelId = "claude-sonnet-4-6-20260217";
// const model = anthropic(modelId);

await explore({
  maxSteps: 500,
  model,
  modelId,
  // The embedded apps for some reason don't get prevented by pin
  excludeElements: [
    "Add new", // Opens Files in embedded mode
    "Google Assistant Routine", // Opens another app in embedded mode
    "Screen saver", // Results in a screan with 0 interaction
    "Help", // Opens some help center in embedded mode
  ],
});
