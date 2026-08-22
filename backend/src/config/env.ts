import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("anthropic/claude-sonnet-4-5"),
  PPOB_PROVIDER: z.string().default("mock"),
  DIGIFLAZZ_USERNAME: z.string().optional(),
  DIGIFLAZZ_DEVELOPMENT_KEY: z.string().optional(),
  DIGIFLAZZ_PRODUCTION_KEY: z.string().optional(),
  DIGIFLAZZ_MODE: z.enum(["development", "production"]).default("development"),
  DIGIFLAZZ_WEBHOOK_SECRET: z.string().optional(),
  NUSAPAY_INTERNAL_URL: z.string().url().default("http://127.0.0.1:4010"),
  NUSAPAY_WEBHOOK_SECRET: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration — check backend/.env against .env.example");
}

export const env = parsed.data;

export const aiEnabled = Boolean(env.ANTHROPIC_API_KEY || env.OPENROUTER_API_KEY);
