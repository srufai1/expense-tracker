import { BottomNav } from "@/components/app-shell/bottom-nav";
import { IdleSignOut } from "@/components/app-shell/idle-sign-out";

// Shell for every signed-in page: page content plus the bottom menu.
// This layout must not read the session at its top level (Cache
// Components rule): each page checks the user inside its own <Suspense>.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 pt-6 pb-28">
        {children}
      </main>
      <BottomNav />
      {/* Signs out after 20 minutes without activity (D-49). */}
      <IdleSignOut />
    </>
  );
}
