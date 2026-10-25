"use client";

import { Camera, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { FormErrorDialog } from "@/components/form-error-dialog";
import { squarePhoto } from "@/components/shrink-photo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { AVATAR_BUCKET, AVATAR_JPEG_QUALITY, AVATAR_SIDE, avatarPath } from "@/lib/avatar";
import { profileInitial } from "@/lib/profile";
import { checkPhotoType } from "@/lib/receipts";
import { createClient } from "@/lib/supabase/client";

import { avatarChanged, removeAvatar } from "./avatar-actions";

// Settings → Profile photo (D-50). The photo is cropped to the middle square
// and shrunk to 256 × 256 px here in the browser (about 15–25 KB), then
// uploaded with the user's own session; the storage policies check the path.
export function ProfilePhotoCard({ userId, email, url }: { userId: string; email: string | null; url: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<{ message: string } | null>(null);

  function upload(file: File) {
    startTransition(async () => {
      const typeError = checkPhotoType(file.type);
      if (typeError) return setFailure({ message: typeError });
      let photo: Blob;
      try {
        photo = await squarePhoto(file, AVATAR_SIDE, AVATAR_JPEG_QUALITY);
      } catch {
        return setFailure({ message: "This photo cannot be read here. Try a JPEG or PNG photo." });
      }
      const { error } = await createClient()
        .storage.from(AVATAR_BUCKET)
        .upload(avatarPath(userId), photo, { contentType: "image/jpeg", upsert: true });
      if (error) return setFailure({ message: "Check your internet connection and try again." });
      await avatarChanged();
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const message = await removeAvatar();
      if (message) return setFailure({ message });
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-4">
      <FormErrorDialog
        attempt={failure}
        title="Could not change the photo"
        messages={failure ? [failure.message] : []}
      />
      {url ? (
        // A signed, short-lived URL to a small private file: no image optimisation.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Your profile photo" className="size-20 shrink-0 rounded-full object-cover" />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-20 shrink-0 items-center justify-center rounded-full bg-primary text-3xl font-bold text-primary-foreground"
        >
          {profileInitial(email)}
        </span>
      )}
      <div className="flex flex-1 flex-col gap-2">
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) upload(file);
          }}
        />
        <Button type="button" variant="outline" className="h-11" disabled={pending} onClick={() => input.current?.click()}>
          <Camera aria-hidden="true" />
          {pending ? "Saving…" : url ? "Change photo" : "Add a photo"}
        </Button>
        {url ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" className="h-11 text-destructive" disabled={pending}>
                <Trash2 aria-hidden="true" />
                Remove photo
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove your profile photo?</AlertDialogTitle>
                <AlertDialogDescription>The first letter of your email shows instead.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-11">Keep it</AlertDialogCancel>
                <AlertDialogAction variant="destructive" className="h-11" onClick={remove}>
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </div>
  );
}
