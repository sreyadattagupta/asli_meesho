"use client";

// Role management (demo provision — production Admin is invite-only, Seller needs KYC).
import { useEffect, useState } from "react";
import { ShieldAlert, Users as UsersIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/nav/PageHeader";
import type { Role, User } from "@/lib/db/types";

const ROLES: Role[] = ["seller", "buyer", "admin"];

export default function UsersPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setErr(null); setForbidden(false);
    try {
      const res = await fetch("/api/admin/users");
      if (res.status === 401 || res.status === 403) { setForbidden(true); return; }
      const body = await res.json();
      if (!res.ok) { setErr(body?.error?.message ?? "Couldn't load users."); return; }
      setUsers(body.users as User[]);
    } catch {
      setErr("Network hiccup — retry.");
    }
  };
  useEffect(() => { void load(); }, []);

  async function changeRole(id: string, role: Role) {
    setSaving(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const body = await res.json();
      if (!res.ok) { toast({ kind: "error", message: body?.error?.message ?? "Update failed." }); return; }
      setUsers((prev) => prev?.map((u) => (u.id === id ? body.user : u)) ?? prev);
      toast({ kind: "success", message: `Role updated to ${role}.` });
    } catch {
      toast({ kind: "error", message: "Network hiccup — retry." });
    } finally {
      setSaving(null);
    }
  }

  if (forbidden) return <EmptyState icon={ShieldAlert} title="Admin access required" hint="Switch to the Admin persona from the header." />;

  return (
    <div className="space-y-4">
      <PageHeader title="Users" subtitle="Who has access, and as what." />
      <p className="flex items-start gap-2 text-xs text-white/50">
        <Badge variant="neutral">demo provision</Badge>
        In production, Admin is invite-only and Seller requires KYC. Here roles are switchable for the demo.
      </p>

      {err ? (
        <Card className="p-6 text-center">
          <p role="alert" className="text-sm text-white/70">{err}</p>
          <button onClick={load} className="btn-primary mt-3 px-5 py-2 text-sm">Retry</button>
        </Card>
      ) : !users ? (
        <Skeleton className="h-48 w-full" />
      ) : users.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No users yet" hint="Users appear here after their first Google sign-in." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-white/40">
              <tr className="border-b border-white/10">
                <th className="p-4 font-semibold">Name</th>
                <th className="p-4 font-semibold">Email</th>
                <th className="p-4 font-semibold">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="p-4 font-medium">{u.name}</td>
                  <td className="p-4 text-white/50">{u.email || "—"}</td>
                  <td className="p-4">
                    <select
                      aria-label={`Role for ${u.name}`}
                      value={u.role}
                      disabled={saving === u.id}
                      onChange={(e) => changeRole(u.id, e.target.value as Role)}
                      className="min-h-[44px] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm capitalize text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet disabled:opacity-40"
                    >
                      {ROLES.map((r) => <option key={r} value={r} className="bg-[#160f26] capitalize">{r}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
