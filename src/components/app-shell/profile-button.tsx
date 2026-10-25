import { signOut } from "@/app/(app)/actions";
import { requireUser } from "@/lib/auth";
import { profileInitial } from "@/lib/profile";

import { ProfileMenu } from "./profile-menu";

// Reads the signed-in user, so PageHeader renders it inside a Suspense
// boundary (Cache Components rule).
export async function ProfileButton() {
  const user = await requireUser();
  return <ProfileMenu email={user.email} initial={profileInitial(user.email)} signOut={signOut} />;
}
