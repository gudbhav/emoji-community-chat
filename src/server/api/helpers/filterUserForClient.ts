import type { User } from "@clerk/nextjs/dist/types/server";

export const filterUserForClient = (user: User) => {
  const emailUsername = user.emailAddresses[0]?.emailAddress.split("@")[0];
  const username =
    user.username ?? user.firstName ?? emailUsername ?? `user_${user.id.slice(-8)}`;

  return {
    id: user.id,
    username,
    profileImageUrl: user.profileImageUrl,
  };
};
