import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { OfflineBanner } from "@/components/OfflineBanner";
import { Providers } from "@/components/Providers";
import { getSession } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <Providers>
      <OfflineBanner />
      <div className="relative mx-auto min-h-screen w-full max-w-xl pb-[80px] md:max-w-3xl">
        <main className="px-4 pt-6">{children}</main>
        <BottomNav />
      </div>
    </Providers>
  );
}
