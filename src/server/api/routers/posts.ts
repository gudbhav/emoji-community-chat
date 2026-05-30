import { clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  createTRPCRouter,
  privateProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

import { filterUserForClient } from "../helpers/filterUserForClient";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { desc, eq } from "drizzle-orm";
import { posts, type Post } from "~/db/schema";

const addUserDataToPosts = async (postRows: Post[]) => {
  if (postRows.length === 0) return [];

  const client = await clerkClient();
  const { data: clerkUsers } = await client.users.getUserList({
    userId: postRows.map((post) => post.authorId),
    limit: 100, // limits the number users being returned from the clerk client
  });
  const users = clerkUsers.map(filterUserForClient);

  return postRows.map((post) => {
    const author = users.find((user) => user.id === post.authorId);
    if (!author) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Author for post not found",
      });
    }

    return { post, author };
  });
};

// Create a new ratelimiter, that allows 3 requests per 1 minute
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(3, "1 m"),
  analytics: true,
  /**
   * Optional prefix for the keys used in redis. This is useful if you want to share a redis
   * instance with other applications and want to avoid key collisions. The default prefix is
   * "@upstash/ratelimit"
   */
  prefix: "@upstash/ratelimit",
});

export const postsRouter = createTRPCRouter({
  getAll: publicProcedure.query(async ({ ctx }) => {
    const postRows = await ctx.db
      .select()
      .from(posts)
      .orderBy(desc(posts.createdAt))
      .limit(100);

    return addUserDataToPosts(postRows);
  }),
  create: privateProcedure
    .input(
      z.object({
        content: z.string().emoji("Emoji's only allowed!!").min(1).max(280),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const authorId = ctx.userId;

      try {
        const { success } = await ratelimit.limit(authorId);
        if (!success) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
          });
        }

        const [post] = await ctx.db
          .insert(posts)
          .values({
            authorId,
            content: input.content,
          })
          .returning();

        if (!post) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create post",
          });
        }

        return post;
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        console.error("post.create failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create post",
          cause: error,
        });
      }
    }),
  getPostsByUserId: publicProcedure
    .input(
      z.object({
        userId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const postRows = await ctx.db
        .select()
        .from(posts)
        .where(eq(posts.authorId, input.userId))
        .orderBy(desc(posts.createdAt))
        .limit(100);

      return addUserDataToPosts(postRows);
    }),
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [post] = await ctx.db
        .select()
        .from(posts)
        .where(eq(posts.id, input.id))
        .limit(1);

      if (!post) throw new TRPCError({ code: "NOT_FOUND" });

      return (await addUserDataToPosts([post]))[0];
    }),
});
