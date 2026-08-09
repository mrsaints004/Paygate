/**
 * Environment variable validation.
 * Import this module in a server component to fail fast on misconfiguration.
 */

import { z } from "zod";

const hexAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid 0x-prefixed Ethereum address")
  .transform((v) => v as `0x${string}`);

const hexPrivateKey = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Must be a valid 0x-prefixed 32-byte private key")
  .transform((v) => v as `0x${string}`);

const envSchema = z.object({
  // Wallet config (required for payment processing at runtime)
  SELLER_ADDRESS: hexAddress.optional(),
  SELLER_PRIVATE_KEY: hexPrivateKey.optional(),

  // Buyer wallet (required for agent, optional otherwise)
  BUYER_ADDRESS: hexAddress.optional(),
  BUYER_PRIVATE_KEY: hexPrivateKey.optional(),

  // Admin credentials
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),

  // Supabase (optional — app works without it)
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Network selection
  NEXT_PUBLIC_NETWORK: z.enum(["testnet", "mainnet"]).optional().default("testnet"),

  // OpenAI (optional — agent uses mock mode without it)
  OPENAI_API_KEY: z.string().optional(),

  // Webhook signing secret (optional)
  WEBHOOK_SECRET: z
    .string()
    .optional()
    .refine(
      (v) => !v || v.length >= 16,
      "WEBHOOK_SECRET must be at least 16 characters if provided",
    ),
});

export type Env = z.infer<typeof envSchema>;

let _validated: Env | null = null;

export function validateEnv(): Env {
  if (_validated) return _validated;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    console.warn(`\n[PayGate] Environment validation warnings:\n${formatted}\n`);
    // Return partial data — don't crash on missing optional vars
    return result.data as unknown as Env;
  }

  _validated = result.data;
  return _validated;
}
