import { BottomNav } from "@/components/BottomNav";

// Phase 2 will add JWT verification here and redirect to /login when absent.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto min-h-screen w-full max-w-xl pb-[80px] md:max-w-3xl">
      <main className="px-4 pt-6">{children}</main>
      <BottomNav />
    </div>
  );
}
