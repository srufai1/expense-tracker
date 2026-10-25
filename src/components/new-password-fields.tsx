import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";

// "New password" and "New password again", shared by the reset page and
// Settings → Change password (D-48).
export function NewPasswordFields({ invalid }: { invalid?: "password" | "confirm" }) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          aria-invalid={invalid === "password"}
          aria-describedby="password-hint"
          className="h-12 text-base"
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          At least 8 characters.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">New password again</Label>
        <PasswordInput
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          required
          maxLength={72}
          aria-invalid={invalid === "confirm"}
          className="h-12 text-base"
        />
      </div>
    </>
  );
}
