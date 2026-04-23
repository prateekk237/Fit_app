import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Skeleton className="h-6 w-28" />
          <Skeleton className="mt-2 h-4 w-40" />
        </div>
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
      <Card className="flex flex-col items-center p-6">
        <Skeleton className="h-52 w-52 rounded-full" />
        <div className="mt-6 w-full space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <div className="mb-1 flex justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <Skeleton className="mb-3 h-4 w-20" />
        <div className="grid grid-cols-8 gap-1.5">
          {Array.from({ length: 15 }).map((_, i) => (
            <Skeleton key={i} className="h-8 rounded-md" />
          ))}
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
      <Skeleton className="h-40 rounded-lg" />
    </div>
  );
}
