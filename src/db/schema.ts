import { v4 as uuidv4 } from "uuid";
import { index, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const posts = pgTable(
  "Post",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv4()),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    content: varchar("content", { length: 255 }).notNull(),
    authorId: text("authorId").notNull(),
  },
  (table) => [index("Post_authorId_idx").on(table.authorId)]
);

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
