import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// `prisma generate` only reads the schema and never connects, so a fresh clone can run
// `npm install` before .env exists. Every command that touches the database still needs DATABASE_URL.
const url = process.env.DATABASE_URL ?? (process.argv.includes('generate') ? 'postgresql://unused@localhost:5432/unused' : env('DATABASE_URL'));

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: { url },
});
