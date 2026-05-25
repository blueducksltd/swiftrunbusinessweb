"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/cn";
import {
  subscribeToMembers,
  addMember,
  updateMember,
  updateMemberRole,
  resendMemberInvitation,
  removeMember,
  type ShopMember,
} from "@/lib/firestore";
import { getShopId, getShopName } from "@/lib/session";

type Role = "Admin" | "Manager" | "Staff" | "Cashier";

const ROLE_STYLES: Record<Role, string> = {
  Admin: "bg-purple-50 text-purple-700",
  Manager: "bg-blue-50 text-[#056abf]",
  Staff: "bg-green-50 text-green-700",
  Cashier: "bg-amber-50 text-amber-700",
};

const AVATAR_COLORS = [
  "bg-blue-200 text-blue-800",
  "bg-green-200 text-green-800",
  "bg-purple-200 text-purple-800",
  "bg-amber-200 text-amber-800",
  "bg-pink-200 text-pink-800",
  "bg-cyan-200 text-cyan-800",
];

const ROLES: Role[] = ["Admin", "Manager", "Staff", "Cashier"];

function initials(m: ShopMember) {
  return `${m.firstName?.[0] ?? ""}${m.lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export default function MembersPage() {
  const [members, setMembers] = useState<ShopMember[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [rolePickerFor, setRolePickerFor] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", role: "" as Role | "" });
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editMember, setEditMember] = useState<ShopMember | null>(null);
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", email: "", role: "" as Role | "" });
  const [editSaving, setEditSaving] = useState(false);
  const [resending, setResending] = useState<string | null>(null);

  useEffect(() => {
    const shopId = getShopId();
    if (!shopId) return;
    const unsub = subscribeToMembers(shopId, setMembers);
    return () => unsub();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const shopId = getShopId();
    if (!shopId) return;
    setSaving(true);
    try {
      await addMember(shopId, {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        role: form.role || "Staff",
        isActive: true,
        invitedAt: null,
      });
      fetch("/api/member-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberEmail: form.email,
          memberName: `${form.firstName} ${form.lastName}`.trim(),
          shopName: getShopName(),
          role: form.role || "Staff",
        }),
      }).catch(() => {});
      setAddOpen(false);
      setForm({ firstName: "", lastName: "", email: "", role: "" });
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(memberId: string, role: Role) {
    const shopId = getShopId();
    if (!shopId) return;
    setRolePickerFor(null);
    await updateMemberRole(shopId, memberId, role);
  }

  async function handleDelete(memberId: string) {
    const shopId = getShopId();
    if (!shopId) return;
    if (!confirm("Remove this team member?")) return;
    await removeMember(shopId, memberId);
  }

  function openEdit(emp: ShopMember) {
    setEditForm({ firstName: emp.firstName, lastName: emp.lastName, email: emp.email, role: emp.role as Role });
    setEditMember(emp);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editMember) return;
    const shopId = getShopId();
    if (!shopId) return;
    setEditSaving(true);
    try {
      await updateMember(shopId, editMember.id, {
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        email: editForm.email,
        role: editForm.role || "Staff",
      });
      setEditMember(null);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleResend(emp: ShopMember) {
    const shopId = getShopId();
    if (!shopId) return;
    setResending(emp.id);
    try {
      await resendMemberInvitation(shopId, emp.id);
      await fetch("/api/member-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberEmail: emp.email,
          memberName: `${emp.firstName} ${emp.lastName}`.trim(),
          shopName: getShopName(),
          role: emp.role,
          isResend: true,
        }),
      });
      alert(`Invitation resent to ${emp.email}`);
    } finally {
      setResending(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-black text-slate-900">Employees</h1>
          <p className="text-sm text-slate-500 mt-0.5">{members.length} team members</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="h-9 px-5 rounded-lg bg-[#056abf] text-white text-sm font-bold hover:bg-blue-700 transition-colors"
        >
          + New Employee
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {members.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <p className="text-sm font-semibold">No team members yet.</p>
            <p className="text-xs mt-1">Add your first employee with the button above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3 w-12" />
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">First Name</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Last Name</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Email</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Role</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className={cn("size-9 rounded-full grid place-items-center text-xs font-black shrink-0", avatarColor(emp.id))}>
                        {initials(emp)}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{emp.firstName}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{emp.lastName}</td>
                    <td className="px-4 py-3 text-slate-500">{emp.email}</td>
                    <td className="px-4 py-3">
                      <div className="relative">
                        <button
                          onClick={() => setRolePickerFor(rolePickerFor === emp.id ? null : emp.id)}
                          className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold cursor-pointer", ROLE_STYLES[emp.role as Role] ?? "bg-slate-100 text-slate-600")}
                        >
                          {emp.role}
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>

                        {rolePickerFor === emp.id && (
                          <div className="absolute left-0 top-8 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-32">
                            {ROLES.map((role) => (
                              <button
                                key={role}
                                onClick={() => changeRole(emp.id, role)}
                                className={cn(
                                  "w-full text-left px-4 py-2 text-xs font-bold hover:bg-slate-50 transition-colors",
                                  emp.role === role ? "text-[#056abf]" : "text-slate-700"
                                )}
                              >
                                {role}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          title="Edit"
                          onClick={() => openEdit(emp)}
                          className="text-slate-400 hover:text-[#056abf] transition-colors"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          title="Resend invitation"
                          onClick={() => handleResend(emp)}
                          disabled={resending === emp.id}
                          className="text-slate-400 hover:text-amber-500 transition-colors disabled:opacity-40"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                            <polyline points="22,6 12,13 2,6" />
                          </svg>
                        </button>
                        <button
                          title="Remove"
                          onClick={() => handleDelete(emp.id)}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" /><path d="M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Backdrop for role picker */}
      {rolePickerFor !== null && (
        <div className="fixed inset-0 z-10" onClick={() => setRolePickerFor(null)} />
      )}

      {/* Edit Employee Modal */}
      {editMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-black text-slate-900">Edit Employee</h2>
              <button onClick={() => setEditMember(null)} className="text-slate-400 hover:text-slate-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleUpdate}>
              <div className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">First Name</label>
                    <input
                      required
                      type="text"
                      value={editForm.firstName}
                      onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))}
                      className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Last Name</label>
                    <input
                      required
                      type="text"
                      value={editForm.lastName}
                      onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))}
                      className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Email</label>
                  <input
                    required
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Role</label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value as Role }))}
                    className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] cursor-pointer"
                  >
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 px-6 pb-5">
                <button
                  type="button"
                  onClick={() => setEditMember(null)}
                  className="flex-1 h-10 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="flex-1 h-10 rounded-lg bg-[#056abf] text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-60"
                >
                  {editSaving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-black text-slate-900">Add Employee</h2>
              <button onClick={() => setAddOpen(false)} className="text-slate-400 hover:text-slate-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAdd}>
              <div className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">First Name</label>
                    <input
                      required
                      type="text"
                      value={form.firstName}
                      onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                      placeholder="John"
                      className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Last Name</label>
                    <input
                      required
                      type="text"
                      value={form.lastName}
                      onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
                      placeholder="Doe"
                      className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Email</label>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="john@kbanstores.com"
                    className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as Role }))}
                    className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] cursor-pointer"
                  >
                    <option value="">Select role</option>
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="px-6 pb-5">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full h-10 rounded-lg bg-[#056abf] text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Send Invitation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
