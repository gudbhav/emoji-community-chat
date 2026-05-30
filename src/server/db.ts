import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "~/db/schema";
import { env } from "~/env.mjs";

const globalForDb = globalThis as unknown as {
  db: ReturnType<typeof drizzle<typeof schema>> | undefined;
};

const sql = neon(env.DATABASE_URL);

export const db = globalForDb.db ?? drizzle(sql, { schema });

if (env.NODE_ENV !== "production") globalForDb.db = db;
