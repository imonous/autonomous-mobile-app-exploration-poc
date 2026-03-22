import { google } from "@ai-sdk/google";
// import { anthropic } from "@ai-sdk/anthropic";
import { explore } from "./orchestrator.js";

const modelId = "gemini-3-flash-preview";
const model = google(modelId);
// const modelId = "claude-sonnet-4-6-20260217";
// const model = anthropic(modelId);

await explore({
  maxSteps: 20,
  model,
  modelId,
  excludeElements: ["Add new", "Google Assistant Routine", "Screen saver"],
});
