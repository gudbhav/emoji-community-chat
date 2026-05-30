import type { User } from "@clerk/backend";

export const filterUserForClient = (user: User) => {
  const emailUsername = user.emailAddresses[0]?.emailAddress.split("@")[0];
  const username =
    user.username ??
    user.firstName ??
    emailUsername ??
    `user_${user.id.slice(-8)}`;

  return {
    id: user.id,
    username,
    profileImageUrl: user.imageUrl,
  };
};
