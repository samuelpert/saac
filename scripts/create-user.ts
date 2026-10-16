/**
 * Create a login from the command line. Use it once on a new install to make the first admin;
 * after that, admins create accounts on the Users screen.
 *
 *   npm run user:create -- --username mperez --name "Maria Perez" --role ADMIN
 *
 * It asks for a temporary password, which the person must change at first sign-in.
 */
import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { createUserSchema } from '@saac/shared';
import { createDb } from '../apps/api/src/db';
import { UsersService } from '../apps/api/src/services/users.service';

const { values } = parseArgs({
  options: {
    username: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string', default: 'ADMIN' },
    email: { type: 'string' },
  },
});

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env first.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const username = values.username ?? (await rl.question('Username: '));
  const name = values.name ?? (await rl.question('Full name: '));
  const temporaryPassword = process.env.NEW_USER_PASSWORD ?? (await rl.question('Temporary password (at least 10 characters): '));
  rl.close();

  const input = createUserSchema.parse({ username, name, email: values.email ?? '', role: values.role?.toUpperCase(), temporaryPassword });
  const db = createDb(url);
  try {
    const user = await new UsersService(db).create(null, input);
    console.log(`Created ${user.role} account "${user.username}". They must set a new password at first sign-in.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
