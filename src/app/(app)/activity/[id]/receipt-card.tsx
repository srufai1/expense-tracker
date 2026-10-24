"use client";

import { Camera, ImageOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { FormErrorDialog } from "@/components/form-error-dialog";
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
import {
  checkPhotoType,
  checkShrunkSize,
  RECEIPT_BUCKET,
  RECEIPT_JPEG_QUALITY,
  RECEIPT_URL_SECONDS,
  receiptPath,
  scaledSize,
} from "@/lib/receipts";
import { createClient } from "@/lib/supabase/client";

// The receipt photo of one transaction (§6.9, D-10, D-43): add, replace or
// remove it. The photo is shrunk here in the browser, then uploaded with the
// user's own session (the storage policies check the path).
export function ReceiptCard({
  transactionId,
  userId,
  url,
  onRemove,
}: {
  transactionId: string;
  userId: string;
  url: string | null;
  onRemove: () => Promise<string | undefined>;
}) {
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
        photo = await shrink(file);
      } catch {
        return setFailure({ message: "This photo cannot be read here. Try a JPEG or PNG photo." });
      }
      const sizeError = checkShrunkSize(photo.size);
      if (sizeError) return setFailure({ message: sizeError });
      const { error } = await createClient()
        .storage.from(RECEIPT_BUCKET)
        .upload(receiptPath(userId, transactionId), photo, { contentType: "image/jpeg", upsert: true });
      if (error) return setFailure({ message: "The photo could not be saved. Check your internet connection and try again." });
      setFailure(null);
      router.refresh();
    });
  }

  // The page's signed link lasts only a few minutes, so opening the full
  // photo signs a fresh one. The tab opens at once (a tab opened after a
  // network call is often blocked), then gets the link.
  async function openFullSize() {
    const tab = window.open("", "_blank");
    const { data, error } = await createClient()
      .storage.from(RECEIPT_BUCKET)
      .createSignedUrl(receiptPath(userId, transactionId), RECEIPT_URL_SECONDS);
    if (error || !tab) {
      tab?.close();
      setFailure({ message: "The photo could not be opened. Check your internet connection and try again." });
      return;
    }
    tab.opener = null;
    tab.location.href = data.signedUrl;
  }

  function remove() {
    startTransition(async () => {
      const message = await onRemove();
      setFailure(message ? { message } : null);
      if (!message) router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4" aria-labelledby="receipt-heading">
      <FormErrorDialog attempt={failure} title="Receipt photo" messages={failure ? [failure.message] : []} />
      <h2 id="receipt-heading" className="text-base font-bold">
        Receipt
      </h2>
      {url ? (
        // A signed link that expires after a few minutes; the photo is never
        // public. Tapping it signs a fresh link (see openFullSize).
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="block overflow-hidden rounded-xl border"
          onClick={(event) => {
            event.preventDefault();
            void openFullSize();
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL, not an optimisable asset */}
          <img src={url} alt="Receipt photo (opens full size)" className="max-h-72 w-full bg-muted object-contain" />
        </a>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ImageOff className="size-4" aria-hidden="true" />
          No photo yet.
        </p>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) upload(file);
        }}
      />
      <div className={url ? "grid grid-cols-2 gap-2" : "grid"}>
        <Button type="button" variant="outline" className="h-11" disabled={pending} onClick={() => input.current?.click()}>
          <Camera aria-hidden="true" />
          {pending ? "Saving…" : url ? "Replace" : "Add photo"}
        </Button>
        {url ? (
          // A removed photo cannot be put back, so ask first.
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" className="h-11 text-destructive" disabled={pending}>
                <Trash2 aria-hidden="true" />
                Remove
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove the receipt photo?</AlertDialogTitle>
                <AlertDialogDescription>The transaction stays. The photo cannot be put back.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-11">Keep it</AlertDialogCancel>
                <AlertDialogAction className="h-11" onClick={remove}>
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </section>
  );
}

// About 1600 px on the longer side, as JPEG (§6.9). The photo's own
// rotation (EXIF) is applied, so it is not saved sideways.
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { width, height } = scaledSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No JPEG"))), "image/jpeg", RECEIPT_JPEG_QUALITY),
  );
}
