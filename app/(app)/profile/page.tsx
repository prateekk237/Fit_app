"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Profile = {
  id: string;
  name: string;
  email: string | null;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number;
  birthDate: string;
  dietPreference: "veg" | "non-veg" | "mixed";
  dailyCalorieTarget: number;
  dailyProteinTargetG: number;
  dailyCarbsTargetG: number;
  dailyFatTargetG: number;
  dailyWaterTargetMl: number;
  timezone: string;
};

type EditState = Pick<
  Profile,
  | "name"
  | "heightCm"
  | "currentWeightKg"
  | "targetWeightKg"
  | "dietPreference"
  | "dailyCalorieTarget"
  | "dailyProteinTargetG"
  | "dailyCarbsTargetG"
  | "dailyFatTargetG"
  | "dailyWaterTargetMl"
>;

async function fetchProfile(): Promise<Profile> {
  const res = await fetch("/api/user/profile");
  if (!res.ok) throw new Error("Failed to load profile");
  return res.json();
}

async function updateProfile(patch: Partial<Profile>): Promise<Profile> {
  const res = await fetch("/api/user/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Update failed");
  return res.json();
}

export default function ProfilePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: profile, isPending, error } = useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
  });

  const [editing, setEditing] = useState<EditState | null>(null);

  const mutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (data) => {
      qc.setQueryData(["profile"], data);
      setEditing(null);
    },
  });

  const bmi = useMemo(() => {
    if (!profile) return null;
    const h = profile.heightCm / 100;
    return profile.currentWeightKg / (h * h);
  }, [profile]);

  if (isPending) return <p className="text-sm text-muted-foreground">Loading profile…</p>;
  if (error || !profile) return <p className="text-sm text-destructive">Failed to load profile.</p>;

  const active: EditState = editing ?? {
    name: profile.name,
    heightCm: profile.heightCm,
    currentWeightKg: profile.currentWeightKg,
    targetWeightKg: profile.targetWeightKg,
    dietPreference: profile.dietPreference,
    dailyCalorieTarget: profile.dailyCalorieTarget,
    dailyProteinTargetG: profile.dailyProteinTargetG,
    dailyCarbsTargetG: profile.dailyCarbsTargetG,
    dailyFatTargetG: profile.dailyFatTargetG,
    dailyWaterTargetMl: profile.dailyWaterTargetMl,
  };
  const isEditing = editing !== null;

  function set<K extends keyof EditState>(key: K, value: EditState[K]) {
    setEditing((e) => ({ ...(e ?? active), [key]: value }));
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold">{profile.name}</h1>
        <p className="text-sm text-muted-foreground">
          BMI {bmi?.toFixed(1)} · {profile.dietPreference}
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Stats &amp; targets</CardTitle>
            <CardDescription>Current metrics and daily goals</CardDescription>
          </div>
          {!isEditing ? (
            <Button size="sm" onClick={() => setEditing(active)}>
              Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(null)}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => mutation.mutate(active)}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Field
            label="Name"
            editing={isEditing}
            value={active.name}
            onChange={(v) => set("name", v)}
            type="text"
          />
          <Field
            label="Diet"
            editing={isEditing}
            value={active.dietPreference}
            onChange={(v) => set("dietPreference", v as EditState["dietPreference"])}
            type="select"
            options={[
              { value: "veg", label: "Veg" },
              { value: "non-veg", label: "Non-veg" },
              { value: "mixed", label: "Mixed" },
            ]}
          />
          <Field label="Height (cm)" editing={isEditing} value={active.heightCm} onChange={(v) => set("heightCm", Number(v))} type="number" />
          <Field label="Weight (kg)" editing={isEditing} value={active.currentWeightKg} onChange={(v) => set("currentWeightKg", Number(v))} type="number" />
          <Field label="Target weight (kg)" editing={isEditing} value={active.targetWeightKg} onChange={(v) => set("targetWeightKg", Number(v))} type="number" />
          <Field label="Calorie target" editing={isEditing} value={active.dailyCalorieTarget} onChange={(v) => set("dailyCalorieTarget", Number(v))} type="number" />
          <Field label="Protein (g)" editing={isEditing} value={active.dailyProteinTargetG} onChange={(v) => set("dailyProteinTargetG", Number(v))} type="number" />
          <Field label="Carbs (g)" editing={isEditing} value={active.dailyCarbsTargetG} onChange={(v) => set("dailyCarbsTargetG", Number(v))} type="number" />
          <Field label="Fat (g)" editing={isEditing} value={active.dailyFatTargetG} onChange={(v) => set("dailyFatTargetG", Number(v))} type="number" />
          <Field label="Water (ml)" editing={isEditing} value={active.dailyWaterTargetMl} onChange={(v) => set("dailyWaterTargetMl", Number(v))} type="number" />
          {mutation.error && (
            <p className="col-span-2 text-sm text-destructive">
              {(mutation.error as Error).message}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <ChangePinDialog />
          <Button variant="outline" onClick={handleLogout}>
            Log out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string | number;
  editing: boolean;
  onChange: (v: string) => void;
  type: "text" | "number" | "select";
  options?: { value: string; label: string }[];
}

function Field({ label, value, editing, onChange, type, options }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs uppercase text-muted-foreground">{label}</Label>
      {editing ? (
        type === "select" ? (
          <select
            className={cn(
              "flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm",
            )}
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
          >
            {options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <Input
            type={type}
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            inputMode={type === "number" ? "decimal" : "text"}
          />
        )
      ) : (
        <p className="text-base font-medium">{value}</p>
      )}
    </div>
  );
}

function ChangePinDialog() {
  const [open, setOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    if (!/^\d{6}$/.test(currentPin) || !/^\d{6}$/.test(newPin)) {
      setError("Both PINs must be 6 digits.");
      return;
    }
    if (newPin !== confirmPin) {
      setError("New PINs don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/user/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin, newPin }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to change PIN");
        return;
      }
      setOpen(false);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Change PIN</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change PIN</DialogTitle>
          <DialogDescription>Enter your current 6-digit PIN and a new one.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <PinField label="Current PIN" value={currentPin} onChange={setCurrentPin} />
          <PinField label="New PIN" value={newPin} onChange={setNewPin} />
          <PinField label="Confirm new PIN" value={confirmPin} onChange={setConfirmPin} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PinField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <Input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      />
    </div>
  );
}
