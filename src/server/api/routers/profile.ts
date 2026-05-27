import { clerkClient } from "@clerk/nextjs/server";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { filterUserForClient } from "../helpers/filterUserForClient";
export const profileReducer = createTRPCRouter({
  getUserByUserName: publicProcedure
    .input(
      z.object({
        username: z.string(),
      })
    )
    .query(async ({ input }) => {
      const client = await clerkClient();
      const { data: users } = await client.users.getUserList({
        username: [input.username],
      });
      const user = users[0];
      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }
      return filterUserForClient(user);
    }),
});
