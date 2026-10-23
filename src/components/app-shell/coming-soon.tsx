import { Card, CardContent } from "@/components/ui/card";

// Temporary content for screens that are built in later steps.
// Delete this component once every screen is built (build step 14).
export function ComingSoon({ what, step }: { what: string; step: string }) {
  return (
    <Card>
      <CardContent className="text-sm text-muted-foreground">
        {what} is built in {step} of the build plan (docs/DESIGN.md, section 11).
      </CardContent>
    </Card>
  );
}
