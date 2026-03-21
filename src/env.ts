import dotenv from "dotenv";
import { z } from "zod/v4";

dotenv.config();

const envSchema = z.object({
  GOOGLE_GENERATIVE_AI_API_KEY: z.string(),
  ANTHROPIC_API_KEY: z.string(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

export const env = parsed.data;
