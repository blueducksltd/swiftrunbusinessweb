"use client";

import { useState, useEffect, Fragment } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import {
  subscribeToProducts,
  subscribeToShop,
  subscribeToShopCategories,
  addProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
  type Product,
  type ProductOption,
  type ShopCategory,
} from "@/lib/firestore";
import { getShopId, getShopName } from "@/lib/session";
import { fmtCurrency } from "@/lib/currency";

type DisplayProduct = {
  id: string;
  name: string;
  price: string;
  qty: number;
  status: Product["status"] & string;
  date: string;
  color: string;
  raw: Product;
};

type ProductFormState = {
  title: string;
  description: string;
  price: string;
  qty: string;
  category: string;
  categoryId: string;
  unit: string;
};

type LaundryFormState = {
  pricingType: "bundle" | "per_item";
  bundleSize: "" | "small" | "medium" | "large";
  maxItems: string;
  includedRule: string;
  excludedRule: string;
  turnaroundHours: string;
};

type OptionFormState = {
  name: string;
  price: string;
  scope: "order" | "bundle" | "item";
};

const EMPTY_PRODUCT_FORM: ProductFormState = {
  title: "",
  description: "",
  price: "",
  qty: "",
  category: "",
  categoryId: "",
  unit: "",
};

const EMPTY_LAUNDRY_FORM: LaundryFormState = {
  pricingType: "per_item",
  bundleSize: "",
  maxItems: "",
  includedRule: "",
  excludedRule: "",
  turnaroundHours: "48",
};

const STATUS_STYLES: Record<string, string> = {
  Active: "bg-green-50 text-green-700",
  "Low Stock": "bg-amber-50 text-amber-700",
  "Out of Stock": "bg-red-50 text-red-700",
};

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-green-100",
  "Low Stock": "bg-amber-100",
  "Out of Stock": "bg-red-100",
};

function fmtDate(ts: unknown): string {
  if (!ts) return "—";
  if (typeof ts === "object" && ts !== null && "seconds" in ts) {
    return new Date((ts as { seconds: number }).seconds * 1000).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  }
  return "—";
}

function formatMoney(amount: number, currency: string) {
  return fmtCurrency(amount ?? 0, currency || undefined);
}

function toDisplay(p: Product, currency: string): DisplayProduct {
  const status = p.status ?? "Active";
  const code = p.currency || currency;
  return {
    id: p.id,
    name: p.name,
    price: formatMoney(p.price ?? 0, code),
    qty: p.stock ?? 0,
    status,
    date: fmtDate(p.createdAt),
    color: STATUS_COLORS[status] ?? "bg-slate-100",
    raw: p,
  };
}

export default function ProductsPage() {
  const [rawProducts, setRawProducts] = useState<Product[]>([]);
  const [products, setProducts] = useState<DisplayProduct[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [tab, setTab] = useState<"detail" | "required">("detail");
  const [form, setForm] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [laundryForm, setLaundryForm] = useState<LaundryFormState>(EMPTY_LAUNDRY_FORM);
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [shopTypeId, setShopTypeId] = useState("");
  const [shopTypeName, setShopTypeName] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageError, setImageError] = useState("");
  const [detailProduct, setDetailProduct] = useState<DisplayProduct | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<OptionFormState[]>([]);
  const [shopCurrency, setShopCurrency] = useState("NGN");

  // Edit modal state
  const [editProduct, setEditProduct] = useState<DisplayProduct | null>(null);
  const [editTab, setEditTab] = useState<"detail" | "required">("detail");
  const [editForm, setEditForm] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [editLaundryForm, setEditLaundryForm] = useState<LaundryFormState>(EMPTY_LAUNDRY_FORM);
  const [editOptions, setEditOptions] = useState<OptionFormState[]>([]);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState("");
  const [editImageError, setEditImageError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    const shopId = getShopId();
    if (!shopId) return;
    const unsubProducts = subscribeToProducts(shopId, (raw) => {
      setRawProducts(raw);
    });
    const unsubShop = subscribeToShop(shopId, (shop) => {
      setShopTypeId(shop?.shopTypeId ?? "");
      setShopTypeName(shop?.shopTypeName ?? "");
      setShopCurrency((shop?.currencyCode || shop?.currency || "NGN").toUpperCase());
    });
    return () => {
      unsubProducts();
      unsubShop();
    };
  }, []);

  useEffect(() => {
    setProducts(rawProducts.map((p) => toDisplay(p, shopCurrency)));
  }, [rawProducts, shopCurrency]);

  useEffect(() => {
    if (!shopTypeId) {
      setCategories([]);
      return;
    }
    const unsub = subscribeToShopCategories(shopTypeId, setCategories);
    return () => unsub();
  }, [shopTypeId]);

  const displayed = filterStatus
    ? products.filter((p) => p.status === filterStatus)
    : products;

  const isLaundryShop =
    shopTypeId.trim().toLowerCase() === "laundry" ||
    shopTypeName.trim().toLowerCase() === "laundry";

  function buildOptions(list: OptionFormState[]): ProductOption[] {
    return list
      .filter((o) => o.name.trim())
      .map((o) => ({
        name: o.name.trim(),
        price: parseFloat(o.price) || 0,
        ...(isLaundryShop ? { scope: o.scope } : {}),
      }));
  }

  function buildLaundryPayload(state: LaundryFormState): Partial<Product> {
    if (!isLaundryShop) return {};
    const isBundle = state.pricingType === "bundle";
    return {
      laundryPricingType: state.pricingType,
      bundleSize: isBundle ? state.bundleSize : "",
      maxItems: isBundle ? parseInt(state.maxItems) || null : null,
      includedRule: state.includedRule.trim(),
      excludedRule: state.excludedRule.trim(),
      turnaroundHours: parseInt(state.turnaroundHours) || null,
    };
  }

  function laundryStateFromProduct(product: Product): LaundryFormState {
    return {
      pricingType: product.laundryPricingType ?? "per_item",
      bundleSize: product.bundleSize ?? "",
      maxItems: product.maxItems?.toString() ?? "",
      includedRule: product.includedRule ?? "",
      excludedRule: product.excludedRule ?? "",
      turnaroundHours: product.turnaroundHours?.toString() ?? "48",
    };
  }

  function emptyOption(): OptionFormState {
    return { name: "", price: "", scope: isLaundryShop ? "item" : "order" };
  }

  function renderLaundryFields(
    state: LaundryFormState,
    setState: (updater: (prev: LaundryFormState) => LaundryFormState) => void,
    lockType = false
  ) {
    if (!isLaundryShop) return null;
    const isBundle = state.pricingType === "bundle";
    return (
      <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-4">
        <div>
          <p className="text-sm font-black text-slate-900">Laundry pricing</p>
          <p className="mt-1 text-xs text-slate-500">
            Bundles are for wash and fold. Special items should be priced separately.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Pricing type</label>
            {lockType ? (
              <div className="w-full h-10 rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm flex items-center font-bold text-slate-600">
                {isBundle ? "Wash & Fold bundle" : "Per item service"}
              </div>
            ) : (
            <select
              value={state.pricingType}
              onChange={(e) =>
                setState((p) => ({
                  ...p,
                  pricingType: e.target.value as LaundryFormState["pricingType"],
                  bundleSize: e.target.value === "bundle" ? p.bundleSize : "",
                  maxItems: e.target.value === "bundle" ? p.maxItems : "",
                }))
              }
              className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#056abf] cursor-pointer"
            >
              <option value="per_item">Per item service</option>
              <option value="bundle">Wash & Fold bundle</option>
            </select>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Bundle size</label>
            <select
              value={state.bundleSize}
              disabled={!isBundle}
              onChange={(e) =>
                setState((p) => ({
                  ...p,
                  bundleSize: e.target.value as LaundryFormState["bundleSize"],
                }))
              }
              className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#056abf] cursor-pointer disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="">Not a bundle</option>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </div>
        </div>
        {isBundle && (
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Maximum regular items</label>
            <input
              required
              type="number"
              min="1"
              value={state.maxItems}
              onChange={(e) => setState((p) => ({ ...p, maxItems: e.target.value }))}
              placeholder="e.g. 15"
              className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">Turnaround time (hours)</label>
          <input
            type="number"
            min="1"
            max="336"
            value={state.turnaroundHours}
            onChange={(e) => setState((p) => ({ ...p, turnaroundHours: e.target.value }))}
            placeholder="e.g. 48"
            className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
          />
          <p className="mt-1 text-[11px] font-semibold text-slate-400">
            How long after intake this service is ready. Customers see this before ordering; the slowest item in an order sets its promise.
          </p>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">Included rule</label>
          <textarea
            value={state.includedRule}
            onChange={(e) => setState((p) => ({ ...p, includedRule: e.target.value }))}
            placeholder={isBundle ? "Regular clothing only, for example shirts, trousers, skirts and casual wear." : "What this service covers."}
            rows={2}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all resize-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">Excluded rule</label>
          <textarea
            value={state.excludedRule}
            onChange={(e) => setState((p) => ({ ...p, excludedRule: e.target.value }))}
            placeholder="e.g. Suits, duvets, curtains, shoes, leather and delicate fabrics must be added separately."
            rows={2}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all resize-none"
          />
        </div>
      </div>
    );
  }

  function handleImageSelect(file: File | null) {
    setImageError("");
    if (imagePreview) URL.revokeObjectURL(imagePreview);

    if (!file) {
      setImageFile(null);
      setImagePreview("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setImageError("Please choose an image file.");
      setImageFile(null);
      setImagePreview("");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setImageError("Image must be 5MB or smaller.");
      setImageFile(null);
      setImagePreview("");
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function resetAddForm() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setForm(EMPTY_PRODUCT_FORM);
    setLaundryForm(EMPTY_LAUNDRY_FORM);
    setImageFile(null);
    setImagePreview("");
    setImageError("");
    setTab("detail");
    setOptions([]);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!imageFile) {
      setImageError("Product image is required.");
      setTab("detail");
      return;
    }
    const shopId = getShopId();
    if (!shopId) return;
    setSaving(true);
    try {
      const imageUrl = imageFile ? await uploadProductImage(shopId, imageFile) : "";
      const cleanOptions = buildOptions(options);
      await addProduct(shopId, getShopName(), {
        categoryId: form.categoryId,
        categoryName: form.category,
        name: form.title,
        description: form.description,
        price: parseFloat(form.price) || 0,
        currency: shopCurrency,
        unit: form.unit || "unit",
        imageUrl,
        isAvailable: true,
        isActive: true,
        stock: parseInt(form.qty) || 0,
        requiredProductIds: [],
        options: cleanOptions,
        ...buildLaundryPayload(laundryForm),
      });
      setAddOpen(false);
      resetAddForm();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this product?")) return;
    await deleteProduct(id);
    setDetailProduct(null);
  }

  function openEdit(p: DisplayProduct) {
    setDetailProduct(null);
    setEditForm({
      title: p.raw.name,
      description: p.raw.description,
      price: p.raw.price.toString(),
      qty: p.raw.stock.toString(),
      category: p.raw.categoryName,
      categoryId: p.raw.categoryId,
      unit: p.raw.unit,
    });
    setEditLaundryForm(laundryStateFromProduct(p.raw));
    setEditOptions((p.raw.options ?? []).map((o) => ({
      name: o.name,
      price: o.price.toString(),
      scope: o.scope ?? "item",
    })));
    setEditImageFile(null);
    setEditImagePreview(p.raw.imageUrl ?? "");
    setEditImageError("");
    setEditTab("detail");
    setEditProduct(p);
  }

  function resetEditForm() {
    if (editImageFile) URL.revokeObjectURL(editImagePreview);
    setEditProduct(null);
    setEditForm(EMPTY_PRODUCT_FORM);
    setEditLaundryForm(EMPTY_LAUNDRY_FORM);
    setEditOptions([]);
    setEditImageFile(null);
    setEditImagePreview("");
    setEditImageError("");
    setEditTab("detail");
  }

  function handleEditImageSelect(file: File | null) {
    setEditImageError("");
    if (editImageFile) URL.revokeObjectURL(editImagePreview);
    if (!file) { setEditImageFile(null); setEditImagePreview(editProduct?.raw.imageUrl ?? ""); return; }
    if (!file.type.startsWith("image/")) { setEditImageError("Please choose an image file."); setEditImageFile(null); return; }
    if (file.size > 5 * 1024 * 1024) { setEditImageError("Image must be 5MB or smaller."); setEditImageFile(null); return; }
    setEditImageFile(file);
    setEditImagePreview(URL.createObjectURL(file));
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editProduct) return;
    const shopId = getShopId();
    if (!shopId) return;
    setEditSaving(true);
    try {
      let imageUrl = editProduct.raw.imageUrl ?? "";
      if (editImageFile) {
        imageUrl = await uploadProductImage(shopId, editImageFile);
      }
      const cleanOptions = buildOptions(editOptions);
      const newStock = parseInt(editForm.qty) || 0;
      await updateProduct(editProduct.id, {
        name: editForm.title,
        description: editForm.description,
        price: parseFloat(editForm.price) || 0,
        stock: newStock,
        isAvailable: newStock > 0,
        unit: editForm.unit || "unit",
        categoryId: editForm.categoryId,
        categoryName: editForm.category,
        imageUrl,
        options: cleanOptions,
        ...buildLaundryPayload(editLaundryForm),
      });
      resetEditForm();
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <>
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-black text-slate-900">{isLaundryShop ? "Laundry Services" : "All Products"}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {displayed.length} {isLaundryShop ? "services listed" : "products listed"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/business"
            className="h-9 px-4 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:border-[#056abf] hover:text-[#056abf] transition-colors inline-flex items-center"
          >
            Store Profile
          </Link>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 outline-none focus:border-[#056abf] cursor-pointer"
          >
            <option value="">Filter</option>
            <option>Active</option>
            <option>Low Stock</option>
            <option>Out of Stock</option>
          </select>
          {isLaundryShop && (
            <button
              onClick={() => {
                setLaundryForm((p) => ({ ...p, pricingType: "bundle" }));
                setAddOpen(true);
              }}
              className="h-9 px-5 rounded-lg bg-[#056abf] text-white text-sm font-bold hover:bg-blue-700 transition-colors"
            >
              + Create Bundle
            </button>
          )}
          <button
            onClick={() => {
              if (isLaundryShop) {
                setLaundryForm((p) => ({ ...p, pricingType: "per_item", bundleSize: "", maxItems: "" }));
              }
              setAddOpen(true);
            }}
            className="h-9 px-5 rounded-lg bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-colors"
          >
            {isLaundryShop ? "+ Add Service" : "+ Add"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {displayed.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <p className="text-sm font-semibold">No products yet.</p>
            <p className="text-xs mt-1">Click &quot;+ Add&quot; to add your first product.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3 w-12" />
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Product</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Price</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Quantity</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Status</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3">Date</th>
                  <th className="text-left text-xs font-bold text-slate-500 px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {displayed.map((p, idx) => (
                  <Fragment key={p.id}>
                    <tr
                      onClick={() => setDetailProduct(p)}
                      className={cn("hover:bg-slate-50 transition-colors cursor-pointer", idx > 0 && "border-t border-slate-100")}
                    >
                      <td className="px-4 py-2">
                        {p.raw.imageUrl ? (
                          <img src={p.raw.imageUrl} alt={p.name} style={{width:72,height:72,minWidth:72,objectFit:"cover",borderRadius:10}} />
                        ) : (
                          <div className={cn("rounded-lg shrink-0", p.color)} style={{width:72,height:72,minWidth:72,borderRadius:10}} />
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-slate-800">{p.name}</div>
                        {isLaundryShop && p.raw.laundryPricingType && (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                              {p.raw.laundryPricingType === "bundle" ? "Bundle" : "Per item"}
                            </span>
                            {p.raw.maxItems ? (
                              <span className="text-[11px] font-semibold text-slate-400">Up to {p.raw.maxItems} items</span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-bold text-slate-900">{p.price}</td>
                      <td className="px-4 py-2.5 text-slate-600">{p.qty}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-bold", STATUS_STYLES[p.status])}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{p.date}</td>
                      <td className="px-4 py-2.5">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </td>
                    </tr>
                    {p.raw.options && p.raw.options.length > 0 && (
                      <tr
                        onClick={() => setDetailProduct(p)}
                        className="cursor-pointer hover:bg-slate-50 transition-colors bg-slate-50/50"
                      >
                        <td colSpan={7} className="px-4 pb-3 pt-1">
                          <div className="flex flex-wrap gap-1.5">
                            {p.raw.options.map((opt, i) => (
                              <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-200 bg-white text-xs text-slate-600">
                                {opt.name}
                                {opt.price > 0 && (
                                  <span className="font-bold text-slate-800">+{formatMoney(opt.price, p.raw.currency || shopCurrency)}</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Product Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-black text-slate-900">
                {isLaundryShop
                  ? laundryForm.pricingType === "bundle"
                    ? "Create Bundle"
                    : "Add Laundry Service"
                  : "Add Product"}
              </h2>
              <button onClick={() => { setAddOpen(false); resetAddForm(); }} className="text-slate-400 hover:text-slate-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 px-6">
              {(["detail", "required"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "py-3 px-1 mr-6 text-sm font-bold border-b-2 -mb-px transition-colors",
                    tab === t
                      ? "border-[#056abf] text-[#056abf]"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  )}
                >
                  {t === "detail" ? (isLaundryShop ? "Service Detail" : "Product Detail") : `Add-ons${options.length > 0 ? ` (${options.length})` : ""}`}
                </button>
              ))}
            </div>

            <form onSubmit={handleAdd}>
              <div className="px-6 py-5 space-y-4">
                {tab === "detail" ? (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">Title</label>
                      <input
                        required
                        type="text"
                        value={form.title}
                        onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                        placeholder={isLaundryShop ? "Service name" : "Product name"}
                        className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">Description</label>
                      <textarea
                        required
                        value={form.description}
                        onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                        placeholder={isLaundryShop ? "Describe the service..." : "Describe the product..."}
                        rows={3}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all resize-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">Price ({shopCurrency})</label>
                        <input
                          required
                          type="number"
                          value={form.price}
                          onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                          placeholder="0"
                          className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">Quantity</label>
                        <input
                          required
                          type="number"
                          value={form.qty}
                          onChange={(e) => setForm((p) => ({ ...p, qty: e.target.value }))}
                          placeholder="0"
                          className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                        />
                      </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">{isLaundryShop ? "Service Image" : "Product Image"} <span className="text-red-500">*</span></label>
                      <label className={`flex min-h-28 cursor-pointer items-center gap-4 rounded-xl border border-dashed p-3 transition-colors hover:border-[#056abf] hover:bg-blue-50/40 ${imageError ? "border-red-400 bg-red-50/40" : "border-slate-300 bg-slate-50/70"}`}>
                        {imagePreview ? (
                          <img src={imagePreview} alt="Product preview" className="size-20 rounded-lg object-cover" />
                        ) : (
                          <span className="flex size-20 items-center justify-center rounded-lg bg-white text-slate-300 shadow-sm">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-slate-700">{imageFile ? imageFile.name : `Upload ${isLaundryShop ? "service" : "product"} image`}</span>
                          <span className="mt-1 block text-xs text-slate-500">PNG, JPG, WebP up to 5MB</span>
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleImageSelect(e.target.files?.[0] ?? null)}
                        />
                      </label>
                      {imageError && <p className="mt-1.5 text-xs font-semibold text-red-600">{imageError}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">Category</label>
                        <select
                          required
                          value={form.categoryId}
                          onChange={(e) => {
                            const category = categories.find((c) => c.id === e.target.value);
                            setForm((p) => ({
                              ...p,
                              categoryId: category?.id ?? "",
                              category: category?.name ?? "",
                            }));
                          }}
                          className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] cursor-pointer"
                        >
                          <option value="">{categories.length ? "Select category" : "No admin categories available"}</option>
                          {categories.map((c) => <option key={c.id} value={c.id}>{c.iconEmoji ? `${c.iconEmoji} ` : ""}{c.name}</option>)}
                        </select>
                        {!categories.length && (
                          <p className="mt-1.5 text-xs text-amber-600">Ask admin to add active product categories for this shop type.</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">Unit</label>
                        <input
                          required
                          type="text"
                          value={form.unit}
                          onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
                          placeholder={isLaundryShop ? "e.g. bundle, item, shirt" : "e.g. kg, piece, pack"}
                          className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                        />
                      </div>
                    </div>
                    {renderLaundryFields(laundryForm, setLaundryForm, true)}
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {isLaundryShop
                        ? "Add optional extras customers can choose, then set whether each extra applies to the whole order, one bundle, or one item."
                        : "Add up to 4 optional extras customers can choose when ordering this product, e.g. drinks, sides, sauces."}
                    </p>

                    {options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={opt.name}
                          onChange={(e) => setOptions((prev) => prev.map((o, idx) => idx === i ? { ...o, name: e.target.value } : o))}
                          placeholder={isLaundryShop ? "Option name (e.g. Stain treatment)" : "Option name (e.g. Coke)"}
                          className="flex-1 h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                        />
                        <div className="relative w-28 shrink-0">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">{shopCurrency}</span>
                          <input
                            type="number"
                            value={opt.price}
                            onChange={(e) => setOptions((prev) => prev.map((o, idx) => idx === i ? { ...o, price: e.target.value } : o))}
                            placeholder="0"
                            className="w-full h-10 rounded-lg border border-slate-200 pl-12 pr-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                          />
                        </div>
                        {isLaundryShop && (
                          <select
                            value={opt.scope}
                            onChange={(e) => setOptions((prev) => prev.map((o, idx) => idx === i ? { ...o, scope: e.target.value as OptionFormState["scope"] } : o))}
                            className="h-10 w-32 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 outline-none focus:border-[#056abf]"
                          >
                            <option value="order">Whole order</option>
                            <option value="bundle">Bundle</option>
                            <option value="item">Per item</option>
                          </select>
                        )}
                        <button
                          type="button"
                          onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
                          className="size-10 shrink-0 rounded-lg border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors grid place-items-center"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))}

                    {options.length < 4 && (
                      <button
                        type="button"
                        onClick={() => setOptions((prev) => [...prev, emptyOption()])}
                        className="w-full h-10 rounded-lg border-2 border-dashed border-slate-200 text-sm font-bold text-slate-400 hover:border-[#056abf] hover:text-[#056abf] transition-colors flex items-center justify-center gap-2"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Add option {options.length > 0 ? `(${4 - options.length} left)` : ""}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setAddOpen(false); resetAddForm(); }}
                  className="flex-1 h-10 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 h-10 rounded-lg bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-colors disabled:opacity-60"
                >
                  {saving ? "Saving…" : isLaundryShop ? "Add Service" : "Add to Menu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-black text-slate-900">{isLaundryShop ? "Edit Laundry Service" : "Edit Product"}</h2>
              <button onClick={resetEditForm} className="text-slate-400 hover:text-slate-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="flex border-b border-slate-100 px-6">
              {(["detail", "required"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setEditTab(t)}
                  className={cn(
                    "py-3 px-1 mr-6 text-sm font-bold border-b-2 -mb-px transition-colors",
                    editTab === t
                      ? "border-[#056abf] text-[#056abf]"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  )}
                >
                  {t === "detail" ? (isLaundryShop ? "Service Detail" : "Product Detail") : `Add-ons${editOptions.length > 0 ? ` (${editOptions.length})` : ""}`}
                </button>
              ))}
            </div>

            <form onSubmit={handleUpdate}>
              <div className="px-6 py-5 space-y-4">
                {editTab === "detail" ? (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">Title</label>
                      <input
                        required
                        type="text"
                        value={editForm.title}
                        onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                        placeholder={isLaundryShop ? "Service name" : "Product name"}
                        className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">Description</label>
                      <textarea
                        required
                        value={editForm.description}
                        onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                        placeholder={isLaundryShop ? "Describe the service..." : "Describe the product..."}
                        rows={3}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all resize-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">Price ({shopCurrency})</label>
                        <input
                          required
                          type="number"
                          value={editForm.price}
                          onChange={(e) => setEditForm((p) => ({ ...p, price: e.target.value }))}
                          placeholder="0"
                          className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">Quantity / Stock</label>
                        <input
                          required
                          type="number"
                          min="0"
                          value={editForm.qty}
                          onChange={(e) => setEditForm((p) => ({ ...p, qty: e.target.value }))}
                          placeholder="0"
                          className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">{isLaundryShop ? "Service Image" : "Product Image"} <span className="text-slate-400 font-normal">(leave unchanged to keep current)</span></label>
                      <label className={`flex min-h-28 cursor-pointer items-center gap-4 rounded-xl border border-dashed p-3 transition-colors hover:border-[#056abf] hover:bg-blue-50/40 ${editImageError ? "border-red-400 bg-red-50/40" : "border-slate-300 bg-slate-50/70"}`}>
                        {editImagePreview ? (
                          <img src={editImagePreview} alt="Product preview" className="size-20 rounded-lg object-cover" />
                        ) : (
                          <span className="flex size-20 items-center justify-center rounded-lg bg-white text-slate-300 shadow-sm">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-slate-700">{editImageFile ? editImageFile.name : "Replace image (optional)"}</span>
                          <span className="mt-1 block text-xs text-slate-500">PNG, JPG, WebP up to 5MB</span>
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleEditImageSelect(e.target.files?.[0] ?? null)}
                        />
                      </label>
                      {editImageError && <p className="mt-1.5 text-xs font-semibold text-red-600">{editImageError}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">Category</label>
                        <select
                          required
                          value={editForm.categoryId}
                          onChange={(e) => {
                            const category = categories.find((c) => c.id === e.target.value);
                            setEditForm((p) => ({
                              ...p,
                              categoryId: category?.id ?? "",
                              category: category?.name ?? "",
                            }));
                          }}
                          className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] cursor-pointer"
                        >
                          <option value="">{categories.length ? "Select category" : "No admin categories available"}</option>
                          {categories.map((c) => <option key={c.id} value={c.id}>{c.iconEmoji ? `${c.iconEmoji} ` : ""}{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">Unit</label>
                        <input
                          required
                          type="text"
                          value={editForm.unit}
                          onChange={(e) => setEditForm((p) => ({ ...p, unit: e.target.value }))}
                          placeholder={isLaundryShop ? "e.g. bundle, item, shirt" : "e.g. kg, piece, pack"}
                          className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                        />
                      </div>
                    </div>
                    {renderLaundryFields(editLaundryForm, setEditLaundryForm)}
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {isLaundryShop
                        ? "Edit optional extras and whether each extra applies to the whole order, one bundle, or one item."
                        : "Edit optional extras customers can choose when ordering this product."}
                    </p>
                    {editOptions.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={opt.name}
                          onChange={(e) => setEditOptions((prev) => prev.map((o, idx) => idx === i ? { ...o, name: e.target.value } : o))}
                          placeholder={isLaundryShop ? "Option name (e.g. Stain treatment)" : "Option name (e.g. Coke)"}
                          className="flex-1 h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                        />
                        <div className="relative w-28 shrink-0">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">{shopCurrency}</span>
                          <input
                            type="number"
                            value={opt.price}
                            onChange={(e) => setEditOptions((prev) => prev.map((o, idx) => idx === i ? { ...o, price: e.target.value } : o))}
                            placeholder="0"
                            className="w-full h-10 rounded-lg border border-slate-200 pl-12 pr-3 text-sm outline-none focus:border-[#056abf] focus:ring-2 focus:ring-[#056abf]/10 transition-all"
                          />
                        </div>
                        {isLaundryShop && (
                          <select
                            value={opt.scope}
                            onChange={(e) => setEditOptions((prev) => prev.map((o, idx) => idx === i ? { ...o, scope: e.target.value as OptionFormState["scope"] } : o))}
                            className="h-10 w-32 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 outline-none focus:border-[#056abf]"
                          >
                            <option value="order">Whole order</option>
                            <option value="bundle">Bundle</option>
                            <option value="item">Per item</option>
                          </select>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditOptions((prev) => prev.filter((_, idx) => idx !== i))}
                          className="size-10 shrink-0 rounded-lg border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors grid place-items-center"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    {editOptions.length < 4 && (
                      <button
                        type="button"
                        onClick={() => setEditOptions((prev) => [...prev, emptyOption()])}
                        className="w-full h-10 rounded-lg border-2 border-dashed border-slate-200 text-sm font-bold text-slate-400 hover:border-[#056abf] hover:text-[#056abf] transition-colors flex items-center justify-center gap-2"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Add option {editOptions.length > 0 ? `(${4 - editOptions.length} left)` : ""}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={resetEditForm}
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

      {/* Product Detail Modal */}
      {detailProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-black text-slate-900">Product Detail</h2>
              <button onClick={() => setDetailProduct(null)} className="text-slate-400 hover:text-slate-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {detailProduct.raw.imageUrl ? (
                <img src={detailProduct.raw.imageUrl} alt={detailProduct.name} className="h-32 w-full rounded-xl object-cover" />
              ) : (
                <div className={cn("h-32 rounded-xl w-full", detailProduct.color)} />
              )}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Name</p>
                <p className="font-black text-slate-900 mt-1">{detailProduct.name}</p>
              </div>
              {detailProduct.raw.description && (
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Description</p>
                  <p className="text-sm text-slate-600 mt-1">{detailProduct.raw.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Price</p>
                  <p className="font-black text-slate-900 mt-1">{detailProduct.price}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Quantity</p>
                  <p className="font-black text-slate-900 mt-1">{detailProduct.qty}</p>
                </div>
              </div>
              {detailProduct.raw.categoryName && (
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Category</p>
                  <p className="text-sm text-slate-700 mt-1">{detailProduct.raw.categoryName}</p>
                </div>
              )}
              {isLaundryShop && detailProduct.raw.laundryPricingType && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-bold text-blue-500 uppercase tracking-wider">Pricing</p>
                      <p className="text-sm font-black text-slate-900 mt-1">
                        {detailProduct.raw.laundryPricingType === "bundle" ? "Wash & Fold bundle" : "Per item service"}
                      </p>
                    </div>
                    {detailProduct.raw.maxItems ? (
                      <div>
                        <p className="text-xs font-bold text-blue-500 uppercase tracking-wider">Limit</p>
                        <p className="text-sm font-black text-slate-900 mt-1">Up to {detailProduct.raw.maxItems} items</p>
                      </div>
                    ) : null}
                  </div>
                  {detailProduct.raw.includedRule && (
                    <div>
                      <p className="text-xs font-bold text-blue-500 uppercase tracking-wider">Included</p>
                      <p className="text-sm text-slate-700 mt-1">{detailProduct.raw.includedRule}</p>
                    </div>
                  )}
                  {detailProduct.raw.excludedRule && (
                    <div>
                      <p className="text-xs font-bold text-blue-500 uppercase tracking-wider">Excluded</p>
                      <p className="text-sm text-slate-700 mt-1">{detailProduct.raw.excludedRule}</p>
                    </div>
                  )}
                </div>
              )}
              {detailProduct.raw.options && detailProduct.raw.options.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Add-ons</p>
                  <div className="space-y-1.5">
                    {detailProduct.raw.options.map((opt, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                        <span className="text-sm text-slate-700">{opt.name}</span>
                        <span className="text-sm font-bold text-slate-900">
                          {opt.price > 0 ? formatMoney(opt.price, detailProduct.raw.currency || shopCurrency) : "Free"}
                        </span>
                        {isLaundryShop && opt.scope && (
                          <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {opt.scope === "order" ? "Whole order" : opt.scope === "bundle" ? "Bundle" : "Per item"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status</p>
                <span className={cn("inline-flex mt-1 px-2.5 py-1 rounded-full text-xs font-bold", STATUS_STYLES[detailProduct.status])}>
                  {detailProduct.status}
                </span>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
              <button
                onClick={() => handleDelete(detailProduct.id)}
                className="h-10 px-4 rounded-lg border border-red-200 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => openEdit(detailProduct)}
                className="flex-1 h-10 rounded-lg border border-[#056abf] text-[#056abf] text-sm font-bold hover:bg-blue-50 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => setDetailProduct(null)}
                className="flex-1 h-10 rounded-lg bg-[#056abf] text-white text-sm font-bold hover:bg-blue-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
