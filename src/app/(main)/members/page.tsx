"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
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
import { authenticatedFetch } from "@/lib/authenticated-fetch";

type Role = "Manager" | "Staff";
type StatusFilter = "all" | "active" | "suspended";

const ROLE_STYLES: Record<Role, string> = {
  Manager: "bg-blue-50 text-[#056abf]",
  Staff: "bg-green-50 text-green-700",
};

const AVATAR_COLORS = [
  "bg-blue-200 text-blue-800",
  "bg-green-200 text-green-800",
  "bg-purple-200 text-purple-800",
  "bg-amber-200 text-amber-800",
  "bg-pink-200 text-pink-800",
  "bg-cyan-200 text-cyan-800",
];

const ROLES: Role[] = ["Manager", "Staff"];

function initials(m: ShopMember) {
  return `${m.firstName?.[0] ?? ""}${m.lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export default function MembersPage() {
  const searchParams = useSearchParams();
  const [members, setMembers] = useState<ShopMember[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [rolePickerFor, setRolePickerFor] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", role: "" as Role | "" });
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editMember, setEditMember] = useState<ShopMember | null>(null);
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", email: "", role: "" as Role | "" });
  const [editSaving, setEditSaving] = useState(false);
  const [resending, setResending] = useState<string | null>(null);

  // Change password state
  const [changePwdFor, setChangePwdFor] = useState<ShopMember | null>(null);
  const [newPwd, setNewPwd] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);

  // Suspend state
  const [suspending, setSuspending] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

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
      const res = await authenticatedFetch("/api/staff/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          firstName: form.firstName,
          lastName: form.lastName,
          role: form.role || "Staff",
          shopId,
          shopName: getShopName(),
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        alert(`Failed to create account: ${json.reason}`);
        return;
      }
      setAddOpen(false);
      setForm({ firstName: "", lastName: "", email: "", password: "", role: "" });
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

  async function handleSuspend(emp: ShopMember) {
    const shopId = getShopId();
    if (!shopId) return;
    const willSuspend = emp.isActive;
    if (!confirm(`${willSuspend ? "Suspend" : "Reactivate"} ${emp.firstName}? They will ${willSuspend ? "lose" : "regain"} access immediately.`)) return;
    setSuspending(emp.id);
    try {
      const res = await authenticatedFetch("/api/staff/suspend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emp.email,
          memberId: emp.id,
          shopId,
          suspend: willSuspend,
        }),
      });
      const json = await res.json();
      if (!json.ok) alert(`Failed: ${json.reason}`);
    } finally {
      setSuspending(null);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!changePwdFor || !newPwd) return;
    setChangingPwd(true);
    try {
      const shopId = getShopId();
      if (!shopId) return;
      const res = await authenticatedFetch("/api/staff/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: changePwdFor.email, password: newPwd, memberId: changePwdFor.id, shopId }),
      });
      const json = await res.json();
      if (json.ok) {
        setChangePwdFor(null);
        setNewPwd("");
        alert("Password updated successfully.");
      } else {
        alert(`Failed: ${json.reason}`);
      }
    } finally {
      setChangingPwd(false);
    }
  }

  async function handleResend(emp: ShopMember) {
    const shopId = getShopId();
    if (!shopId) return;
    setResending(emp.id);
    try {
      await resendMemberInvitation(shopId, emp.id);
      await authenticatedFetch("/api/member-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberEmail: emp.email,
          memberId: emp.id,
          shopId,
          isResend: true,
        }),
      });
      alert(`Invitation resent to ${emp.email}`);
    } finally {
      setResending(null);
    }
  }

  const searchTerm = (searchParams.get("q") ?? "").trim().toLowerCase();
  const filteredMembers = members.filter((emp) => {
    if (roleFilter !== "all" && emp.role !== roleFilter) return false;
    if (statusFilter === "active" && !emp.isActive) return false;
    if (statusFilter === "suspended" && emp.isActive) return false;
    if (!searchTerm) return true;
    return [
      emp.firstName,
      emp.lastName,
      emp.email,
      emp.role,
      emp.isActive ? "active" : "suspended",
    ].some((value) => String(value ?? "").toLowerCase().includes(searchTerm));
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-black text-slate-900">Employees</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {members.length} team members{searchTerm ? ` · ${filteredMembers.length} matching "${searchParams.get("q")}"` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as Role | "all")}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 outline-none focus:border-[#056abf] cursor-pointer"
          >
            <option value="all">All roles</option>
            {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 outline-none focus:border-[#056abf] cursor-pointer"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
          <button
            onClick={() => setAddOpen(true)}
            className="h-9 px-5 rounded-lg bg-[#056abf] text-white text-sm font-bold hover:bg-blue-700 transition-colors"
          >
            + New Employee
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {members.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <p className="text-sm font-semibold">No team members yet.</p>
            <p className="text-xs mt-1">Add your first employee with the button above.</p>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <p className="text-sm font-semibold">No matching employees.</p>
            <p className="text-xs mt-1">Try another search or adjust the filters.</p>
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
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Status</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMembers.map((emp) => (
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
                          <div className="absolute left-0 bottom-full mb-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-32">
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
                      <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold", emp.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600")}>
                        {emp.isActive ? "Active" : "Suspended"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button title="Edit" onClick={() => openEdit(emp)} className="text-slate-400 hover:text-[#056abf] transition-colors">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button title="Change password" onClick={() => { setChangePwdFor(emp); setNewPwd(""); }} className="text-slate-400 hover:text-amber-500 transition-colors">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        </button>
                        <button
                          title={emp.isActive ? "Suspend" : "Reactivate"}
                          onClick={() => handleSuspend(emp)}
                          disabled={suspending === emp.id}
                          className={cn("transition-colors disabled:opacity-40", emp.isActive ? "text-slate-400 hover:text-orange-500" : "text-slate-400 hover:text-green-600")}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            {emp.isActive
                              ? <><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></>
                              : <><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></>
                            }
                          </svg>
                        </button>
                        <button title="Remove" onClick={() => handleDelete(emp.id)} className="text-slate-400 hover:text-red-500 transition-colors">
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

      {/* Change Password Modal */}
      {changePwdFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="font-black text-slate-900">Change Password</h2>
                <p className="text-xs text-slate-500 mt-0.5">{changePwdFor.firstName} {changePwdFor.lastName}</p>
              </div>
              <button onClick={() => setChangePwdFor(null)} className="text-slate-400 hover:text-slate-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleChangePassword}>
              <div className="px-6 py-5">
                <label className="block text-xs font-bold text-slate-600 mb-1.5">New Password</label>
                <input
                  required
                  type="password"
                  minLength={6}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                />
              </div>
              <div className="flex gap-3 px-6 pb-5">
                <button type="button" onClick={() => setChangePwdFor(null)} className="flex-1 h-10 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                <button type="submit" disabled={changingPwd} className="flex-1 h-10 rounded-lg bg-[#056abf] text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-60">
                  {changingPwd ? "Updating…" : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
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
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Password</label>
                  <input
                    required
                    type="password"
                    minLength={6}
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    placeholder="Min. 6 characters"
                    className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                  />
                  <p className="mt-1 text-xs text-slate-400">Share this with the employee so they can log in.</p>
                </div>
              </div>
              <div className="px-6 pb-5">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full h-10 rounded-lg bg-[#056abf] text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-60"
                >
                  {saving ? "Creating…" : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
