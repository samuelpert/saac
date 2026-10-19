import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is not set. Copy .env.example to .env and fill it in.'),
  PORT: z.coerce.number().int().positive().default(3000),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(240).default(120),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  BACKUP_STALE_HOURS: z.coerce.number().positive().default(30),
  BACKUP_DIR: z.string().default('./backups'),
  // The only call the app makes outside the host: filling in a book title from its ISBN.
  OPEN_LIBRARY_LOOKUP: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  return parsed.data;
}
