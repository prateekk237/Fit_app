import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Fit</h1>
        <p className="text-sm text-muted-foreground">
          Dashboard — full build lands in Phase 3.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Phase 0 scaffold</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Navigation works. Database, auth, logging, AI and PWA arrive in later phases.
        </CardContent>
      </Card>
    </div>
  );
}
