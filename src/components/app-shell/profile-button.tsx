import { signOut } from "@/app/(app)/actions";
import { getAvatar } from "@/app/(app)/settings/avatar-data";
import { profileInitial } from "@/lib/profile";

import { ProfileMenu } from "./profile-menu";

// Reads the signed-in user and their photo (D-50), so PageHeader renders it
// inside a Suspense boundary (Cache Components rule).
export async function ProfileButton() {
  const avatar = await getAvatar();
  return (
    <ProfileMenu email={avatar.email} initial={profileInitial(avatar.email)} photoUrl={avatar.url} signOut={signOut} />
  );
}
