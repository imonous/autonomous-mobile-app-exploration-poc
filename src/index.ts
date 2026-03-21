import { google } from "@ai-sdk/google";
import { explore } from "./orchestrator.js";

const modelId = "gemini-3-flash-preview";
const model = google(modelId);

await explore({
  maxSteps: 50,
  staleLimit: 10,
  model,
  modelId,
});
