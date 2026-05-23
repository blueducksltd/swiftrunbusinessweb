"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/cn";
import { fmtCurrency } from "@/lib/currency";
import { subscribeToShop } from "@/lib/firestore";
import { getShopId } from "@/lib/session";

// ── Types ─────────────────────────────────────────────────────────────────

type PayoutRecord = {
  id: number;
  amount: string;
  currency: string;
  provider: string;
  reference: string;
  status: "pending" | "success" | "failed";
  notes: string;
  createdAt: string | null;
};

type PayoutAccount = {
  id: number;
  provider: "PAYSTACK" | "BANK_TRANSFER";
  country: string;
  currency: string;
  isVerified: boolean;
  // Paystack
  bankName?: string;
  bankCode?: string;
  accountNumber?: string;
  accountName?: string;
  recipientCode?: string;
  // Bank transfer
  accountHolderName?: string;
  iban?: string;
  swiftBic?: string;
  sortCode?: string;
  routingNumber?: string;
};

type Bank = { name: string; code: string };

// ── Page ──────────────────────────────────────────────────────────────────

export default function PayoutPage() {
  const [account, setAccount] = useState<PayoutAccount | null | undefined>(undefined);
  const [history, setHistory] = useState<PayoutRecord[]>([]);
  const [shopCurrency, setShopCurrency] = useState("NGN");
  const [shopCountry, setShopCountry] = useState("NG");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  const isNigeria = shopCurrency === "NGN" || shopCountry === "NG";

  useEffect(() => {
    const shopId = getShopId();
    if (!shopId) { setLoading(false); return; }

    const unsub = subscribeToShop(shopId, (shop) => {
      const currency = (shop?.currency || shop?.currencyCode || "NGN").toUpperCase();
      const country = (shop?.countryCode || shop?.isoCode || "NG").toUpperCase();
      setShopCurrency(currency);
      setShopCountry(country);
    });

    Promise.all([
      fetch(`/api/admin/payout/account?shop_id=${encodeURIComponent(shopId)}`).then((r) => r.json()),
      fetch(`/api/admin/payout/history?shop_id=${encodeURIComponent(shopId)}`).then((r) => r.json()),
    ])
      .then(([accountData, historyData]) => {
        setAccount(accountData.account ?? null);
        setHistory(historyData.payouts ?? []);
        setLoading(false);
      })
      .catch(() => { setAccount(null); setLoading(false); });

    return () => unsub();
  }, []);

  function handleSaved(acc: PayoutAccount) {
    setAccount(acc);
    setEditing(false);
  }

  async function handleRemove() {
    if (!account) return;
    await fetch(`/api/admin/payout/account?id=${account.id}`, { method: "DELETE" });
    setAccount(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="size-10 rounded-full border-4 border-[#056abf] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-900">Payout Account</h1>
        <p className="text-sm text-slate-500 mt-1">
          Where SwiftRun sends your earnings after each completed order.
        </p>
      </div>

      <div className="space-y-6">
        {/* Current account card */}
        {account && !editing ? (
          <AccountCard account={account} onEdit={() => setEditing(true)} onRemove={handleRemove} />
        ) : editing || account === null ? (
          <PayoutForm
            shopId={getShopId() ?? ""}
            isNigeria={isNigeria}
            shopCurrency={shopCurrency}
            shopCountry={shopCountry}
            existing={account ?? null}
            onSaved={handleSaved}
            onCancel={account ? () => setEditing(false) : undefined}
          />
        ) : null}

        {/* Payout history */}
        <PayoutHistory records={history} />
      </div>
    </>
  );
}

// ── Account summary card ────────────────────────────────────────────────

function AccountCard({
  account,
  onEdit,
  onRemove,
}: {
  account: PayoutAccount;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  const isPaystack = account.provider === "PAYSTACK";

  return (
    <div className="max-w-xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-blue-50 grid place-items-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#056abf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
            </div>
            <div>
              <p className="font-black text-slate-900">{isPaystack ? "Paystack" : "Bank Transfer"}</p>
              <p className="text-xs text-slate-400">{account.currency} · {account.country}</p>
            </div>
          </div>
          <span className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold",
            account.isVerified
              ? "bg-green-50 text-green-700"
              : "bg-amber-50 text-amber-700"
          )}>
            {account.isVerified ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
            {account.isVerified ? "Verified" : "Pending verification"}
          </span>
        </div>

        {/* Details */}
        <div className="space-y-3">
          {isPaystack ? (
            <>
              <Detail label="Bank" value={account.bankName ?? "—"} />
              <Detail label="Account number" value={account.accountNumber ?? "—"} />
              <Detail label="Account name" value={account.accountName ?? "—"} />
            </>
          ) : (
            <>
              {account.bankName && <Detail label="Bank" value={account.bankName} />}
              <Detail label="Account holder" value={account.accountHolderName ?? "—"} />
              {account.iban && <Detail label="IBAN" value={account.iban} mono />}
              {account.accountNumber && !account.iban && <Detail label="Account number" value={account.accountNumber} mono />}
              {account.swiftBic && <Detail label="SWIFT / BIC" value={account.swiftBic} mono />}
              {account.sortCode && <Detail label="Sort code" value={account.sortCode} mono />}
              {account.routingNumber && <Detail label="Routing number" value={account.routingNumber} mono />}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onEdit}
            className="flex-1 h-10 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => setConfirmRemove(true)}
            className="flex-1 h-10 rounded-lg border border-red-200 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors"
          >
            Remove
          </button>
        </div>
      </div>

      {/* Remove confirm */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8 text-center">
            <div className="size-14 rounded-full bg-red-50 grid place-items-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
              </svg>
            </div>
            <h3 className="text-base font-black text-slate-900 mb-1.5">Remove account?</h3>
            <p className="text-sm text-slate-500 mb-6">You won't receive payouts until you add a new account.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmRemove(false)} className="flex-1 h-10 rounded-lg border border-slate-200 text-sm font-bold text-slate-600">Cancel</button>
              <button onClick={() => { setConfirmRemove(false); onRemove(); }} className="flex-1 h-10 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-b-0">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={cn("text-sm font-bold text-slate-900 text-right", mono && "font-mono")}>{value}</p>
    </div>
  );
}

// ── Payout form ────────────────────────────────────────────────────────────

function PayoutForm({
  shopId,
  isNigeria,
  shopCurrency,
  shopCountry,
  existing,
  onSaved,
  onCancel,
}: {
  shopId: string;
  isNigeria: boolean;
  shopCurrency: string;
  shopCountry: string;
  existing: PayoutAccount | null;
  onSaved: (a: PayoutAccount) => void;
  onCancel?: () => void;
}) {
  return (
    <div className="max-w-xl">
      {isNigeria ? (
        <PaystackForm
          shopId={shopId}
          existing={existing}
          onSaved={onSaved}
          onCancel={onCancel}
        />
      ) : (
        <BankTransferForm
          shopId={shopId}
          shopCurrency={shopCurrency}
          shopCountry={shopCountry}
          existing={existing}
          onSaved={onSaved}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}

// ── Paystack form (NGN) ───────────────────────────────────────────────────

function PaystackForm({
  shopId,
  existing,
  onSaved,
  onCancel,
}: {
  shopId: string;
  existing: PayoutAccount | null;
  onSaved: (a: PayoutAccount) => void;
  onCancel?: () => void;
}) {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankCode, setBankCode] = useState(existing?.bankCode ?? "");
  const [bankName, setBankName] = useState(existing?.bankName ?? "");
  const [accountNumber, setAccountNumber] = useState(existing?.accountNumber ?? "");
  const [accountName, setAccountName] = useState(existing?.accountName ?? "");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/payout/banks?currency=NGN")
      .then((r) => r.json())
      .then((d) => setBanks(d.banks ?? []))
      .catch(() => {});
  }, []);

  const verify = useCallback(async () => {
    if (!bankCode || accountNumber.length < 10) return;
    setVerifying(true);
    setVerifyError("");
    setAccountName("");
    try {
      const r = await fetch("/api/admin/payout/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_number: accountNumber, bank_code: bankCode }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Verification failed");
      setAccountName(d.account_name);
    } catch (e) {
      setVerifyError((e as Error).message);
    } finally {
      setVerifying(false);
    }
  }, [bankCode, accountNumber]);

  // Auto-verify when account number is complete
  useEffect(() => {
    if (accountNumber.length === 10 && bankCode) verify();
  }, [accountNumber, bankCode, verify]);

  async function save() {
    if (!bankCode || !accountNumber || !accountName) return;
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/admin/payout/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_id: shopId,
          provider: "PAYSTACK",
          bank_name: bankName,
          bank_code: bankCode,
          account_number: accountNumber,
          account_name: accountName,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to save");
      onSaved(d.account);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormCard title="Nigerian Bank Account" subtitle="Payouts sent via Paystack">
      <div className="space-y-4">
        {/* Bank selector */}
        <Field label="Bank">
          <select
            value={bankCode}
            onChange={(e) => {
              const b = banks.find((b) => b.code === e.target.value);
              setBankCode(e.target.value);
              setBankName(b?.name ?? "");
              setAccountName("");
            }}
            className="w-full h-11 rounded-lg border border-slate-200 px-3 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#056abf] focus:border-transparent"
          >
            <option value="">Select bank…</option>
            {banks.map((b) => (
              <option key={b.code} value={b.code}>{b.name}</option>
            ))}
          </select>
        </Field>

        {/* Account number */}
        <Field label="Account number">
          <input
            type="text"
            inputMode="numeric"
            maxLength={10}
            value={accountNumber}
            onChange={(e) => { setAccountNumber(e.target.value.replace(/\D/g, "")); setAccountName(""); }}
            placeholder="10-digit account number"
            className="w-full h-11 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#056abf] focus:border-transparent font-mono"
          />
        </Field>

        {/* Verified account name */}
        {verifying && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div className="size-4 rounded-full border-2 border-[#056abf] border-t-transparent animate-spin" />
            Verifying account…
          </div>
        )}
        {verifyError && <p className="text-sm text-red-600">{verifyError}</p>}
        {accountName && !verifying && (
          <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <p className="text-sm font-bold text-green-700">{accountName}</p>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <FormActions
          canSubmit={!!bankCode && accountNumber.length === 10 && !!accountName && !verifying}
          saving={saving}
          onSave={save}
          onCancel={onCancel}
          label="Save account"
        />
      </div>
    </FormCard>
  );
}

// ── Bank transfer form (international) ───────────────────────────────────

function BankTransferForm({
  shopId,
  shopCurrency,
  shopCountry,
  existing,
  onSaved,
  onCancel,
}: {
  shopId: string;
  shopCurrency: string;
  shopCountry: string;
  existing: PayoutAccount | null;
  onSaved: (a: PayoutAccount) => void;
  onCancel?: () => void;
}) {
  const [bankName, setBankName] = useState(existing?.bankName ?? "");
  const [holderName, setHolderName] = useState(existing?.accountHolderName ?? "");
  const [accountNumber, setAccountNumber] = useState(existing?.accountNumber ?? "");
  const [iban, setIban] = useState(existing?.iban ?? "");
  const [swiftBic, setSwiftBic] = useState(existing?.swiftBic ?? "");
  const [sortCode, setSortCode] = useState(existing?.sortCode ?? "");
  const [routingNumber, setRoutingNumber] = useState(existing?.routingNumber ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isUK = shopCountry === "GB";
  const isUS = shopCountry === "US";
  const useIBAN = ["GB", "MT", "IE", "DE", "FR", "ES", "NL", "PT", "IT"].includes(shopCountry);

  async function save() {
    if (!holderName || (!iban && !accountNumber)) return;
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/admin/payout/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_id: shopId,
          provider: "BANK_TRANSFER",
          country: shopCountry,
          currency: shopCurrency,
          bank_name: bankName,
          account_holder_name: holderName,
          account_number: accountNumber,
          iban,
          swift_bic: swiftBic,
          sort_code: sortCode,
          routing_number: routingNumber,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to save");
      onSaved(d.account);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormCard title="Bank Account" subtitle={`${shopCurrency} bank transfer · ${shopCountry}`}>
      <div className="space-y-4">
        <Field label="Account holder name">
          <input
            type="text"
            value={holderName}
            onChange={(e) => setHolderName(e.target.value)}
            placeholder="Full legal name on bank account"
            className={inputCls}
          />
        </Field>

        <Field label="Bank name">
          <input
            type="text"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="e.g. Barclays, HSBC"
            className={inputCls}
          />
        </Field>

        {useIBAN ? (
          <Field label="IBAN">
            <input
              type="text"
              value={iban}
              onChange={(e) => setIban(e.target.value.toUpperCase().replace(/\s/g, ""))}
              placeholder={isUK ? "GB00 BANK 0000 0000 0000 00" : "IBAN"}
              className={cn(inputCls, "font-mono")}
            />
          </Field>
        ) : (
          <Field label="Account number">
            <input
              type="text"
              inputMode="numeric"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Account number"
              className={cn(inputCls, "font-mono")}
            />
          </Field>
        )}

        <Field label="SWIFT / BIC">
          <input
            type="text"
            value={swiftBic}
            onChange={(e) => setSwiftBic(e.target.value.toUpperCase())}
            placeholder="e.g. BARCGB22"
            className={cn(inputCls, "font-mono")}
          />
        </Field>

        {isUK && (
          <Field label="Sort code">
            <input
              type="text"
              value={sortCode}
              onChange={(e) => setSortCode(e.target.value)}
              placeholder="00-00-00"
              className={cn(inputCls, "font-mono")}
            />
          </Field>
        )}

        {isUS && (
          <Field label="Routing number">
            <input
              type="text"
              inputMode="numeric"
              value={routingNumber}
              onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, ""))}
              placeholder="9-digit routing number"
              className={cn(inputCls, "font-mono")}
            />
          </Field>
        )}

        <p className="text-xs text-slate-400 bg-slate-50 rounded-lg p-3">
          Bank details are stored securely. SwiftRun will manually verify international accounts before the first payout.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <FormActions
          canSubmit={!!holderName && (!!iban || !!accountNumber) && !!swiftBic}
          saving={saving}
          onSave={save}
          onCancel={onCancel}
          label="Save account"
        />
      </div>
    </FormCard>
  );
}

// ── Shared UI helpers ──────────────────────────────────────────────────────

const inputCls =
  "w-full h-11 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#056abf] focus:border-transparent";

function FormCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-black text-slate-900">{title}</h2>
      <p className="text-sm text-slate-500 mt-0.5 mb-5">{subtitle}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

// ── Payout history ────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  success: "bg-green-50 text-green-700",
  pending: "bg-amber-50 text-amber-700",
  failed: "bg-red-50 text-red-700",
};

function PayoutHistory({ records }: { records: PayoutRecord[] }) {
  return (
    <div className="max-w-xl">
      <h2 className="text-base font-black text-slate-900 mb-3">Payout history</h2>
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {records.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-semibold text-slate-400">No payouts yet</p>
            <p className="text-xs text-slate-300 mt-1">Your payout history will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {records.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-4">
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 text-sm">
                    {fmtCurrency(parseFloat(p.amount), p.currency)}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </p>
                  {p.notes && <p className="text-xs text-slate-400 mt-0.5">{p.notes}</p>}
                </div>
                <span className={cn("px-2.5 py-1 rounded-full text-xs font-bold capitalize shrink-0", STATUS_BADGE[p.status] ?? "bg-slate-50 text-slate-500")}>
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FormActions({
  canSubmit,
  saving,
  onSave,
  onCancel,
  label,
}: {
  canSubmit: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel?: () => void;
  label: string;
}) {
  return (
    <div className="flex gap-3 pt-2">
      {onCancel && (
        <button
          onClick={onCancel}
          className="flex-1 h-11 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
      )}
      <button
        onClick={onSave}
        disabled={!canSubmit || saving}
        className={cn(
          "flex-1 h-11 rounded-lg text-sm font-bold text-white transition-colors",
          canSubmit && !saving ? "bg-[#056abf] hover:bg-blue-700" : "bg-slate-300 cursor-not-allowed"
        )}
      >
        {saving ? (
          <span className="flex items-center justify-center gap-2">
            <span className="size-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            Saving…
          </span>
        ) : label}
      </button>
    </div>
  );
}
