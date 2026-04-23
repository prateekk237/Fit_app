import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-60px)] w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Compass className="h-8 w-8" aria-hidden />
      </div>
      <h1 className="mt-5 text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        That route doesn&apos;t exist in Fit. It may have moved, or the link is wrong.
      </p>
      <div className="mt-6 flex gap-2">
        <Button asChild>
          <Link href="/">Back to dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/log">Log something</Link>
        </Button>
      </div>
    </div>
  );
}
