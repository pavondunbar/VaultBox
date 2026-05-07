import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@/lib/db/schema";

/**
 * Common database context type accepted by both the root `db`
 * instance and Drizzle transaction objects (`tx`).
 */
export type DbContext = NodePgDatabase<typeof schema>;
