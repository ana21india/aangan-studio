// Creates or updates a dashboard admin. The password is read from stdin, never from the command line.
//   echo "the-password" | npm run admin:set -- someone@example.com "Their Name" --temporary
// With --temporary the admin must choose a new password at first sign-in.
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/lib/auth/password";

config({ path: ".env.local" });

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf-8").trim();
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const temporary = process.argv.includes("--temporary");
  const [emailRaw, name] = args;
  if (!emailRaw) throw new Error('Usage: echo "password" | npm run admin:set -- email "Name" [--temporary]');
  const email = emailRaw.trim().toLowerCase();
  const password = await readStdin();
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);

  const sql = neon(process.env.DATABASE_URL!);
  await sql.query(
    `insert into admins (email, name, password_hash, must_change) values ($1, $2, $3, $4)
     on conflict (email) do update set password_hash = excluded.password_hash, must_change = excluded.must_change,
       name = coalesce(excluded.name, admins.name), failed_attempts = 0, locked_until = null`,
    [email, name ?? null, await hashPassword(password), temporary],
  );
  console.log(`Admin ${email}: password set${temporary ? " (temporary, must be changed at first sign-in)" : ""}.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
