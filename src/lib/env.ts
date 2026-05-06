import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/),
  ETH_RPC_URL: z.string().url(),
  SOL_RPC_URL: z.string().url(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    ETH_RPC_URL: process.env.ETH_RPC_URL,
    SOL_RPC_URL: process.env.SOL_RPC_URL,
  });
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** JWT verification only — avoids requiring DB/RPC when parsing cookies. */
export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }
  return s;
}

export type SmtpEnv = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

export function getSmtpEnv(): SmtpEnv | null {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !port || !user || !pass || !from) {
    return null;
  }

  return { host, port: parseInt(port, 10), user, pass, from };
}

export function getAppUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}
