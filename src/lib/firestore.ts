import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  Timestamp,
  type QuerySnapshot,
  type DocumentData,
} from "firebase/firestore";
import { db, storage } from "./firebase";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

// ── Types ──────────────────────────────────────────────────────────────────

export const MAX_BUSINESS_IMAGE_SIZE = 20 * 1024 * 1024;
const ALLOWED_BUSINESS_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_BUSINESS_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

export function validateBusinessImageFile(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const type = file.type.toLowerCase();

  if (ext === "svg" || type === "image/svg+xml") {
    throw new Error("SVG images are not allowed for security reasons. Please upload a JPG, PNG, or WEBP image.");
  }

  if (!ALLOWED_BUSINESS_IMAGE_EXTENSIONS.has(ext) || !ALLOWED_BUSINESS_IMAGE_TYPES.has(type)) {
    throw new Error("Please upload a JPG, PNG, or WEBP image.");
  }

  if (file.size > MAX_BUSINESS_IMAGE_SIZE) {
    throw new Error("This image is too large. Please upload an image smaller than 20MB.");
  }
}

export type ProductStatus = "Active" | "Low Stock" | "Out of Stock";

export interface ProductOption {
  name: string;
  price: number;
  scope?: "order" | "bundle" | "item";
}

export interface Product {
  id: string;
  shopId: string;
  shopName: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string;
  price: number;
  currency?: string;
  unit: string;
  imageUrl: string;
  isAvailable: boolean;
  isActive: boolean;
  stock: number;
  requiredProductIds: string[];
  options: ProductOption[];
  laundryPricingType?: "bundle" | "per_item";
  bundleSize?: "small" | "medium" | "large" | "";
  maxItems?: number | null;
  includedRule?: string;
  excludedRule?: string;
  turnaroundHours?: number | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  status?: ProductStatus;
}

export type ErrandStatus =
  | "pending"
  | "accepted"
  | "driver_at_shop"
  | "preparing"
  | "ready"
  | "picked_up"
  | "laundry_picked_up_from_customer"
  | "laundry_at_store"
  | "laundry_processing"
  | "laundry_ready_for_return"
  | "laundry_picked_up_from_store"
  | "delivered"
  | "cancelled";

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
  total: number;
  imageUrl: string;
  unit: string;
  // Per-item add-ons / options the customer selected (saved by the app).
  selectedOptions?: { name?: string; qty?: number; price?: number }[];
}

export interface ErrandOrder {
  id: string;
  orderType?: "errand" | "laundry";
  orderNumber: string;
  orderCode: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  shopId: string;
  shopName: string;
  driverId: string | null;
  driverName: string | null;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  serviceCharge?: number;
  paymentProcessingFee?: number;
  businessGross?: number;
  businessCommission?: number;
  businessNet?: number;
  tax: number;
  total: number;
  status: ErrandStatus;
  paymentStatus: string | boolean;
  paymentVerified?: boolean;
  isPaymentDraft?: boolean;
  paymentReference: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  pickupLocation: { description: string; latitude: number; longitude: number };
  deliveryLocation: { description: string; latitude: number; longitude: number };
  notes: string;
  customerLaundryPhotoUrls?: string[];
  laundryDetails?: {
    customerPhotoUrls?: string[];
    intakeNotes?: Array<{
      item?: string;
      action?: string;
      reason?: string;
      note?: string;
      recordedAt?: Timestamp | null;
    }>;
    turnaroundHours?: number;
    expectedReadyAt?: Timestamp | null;
    readyTimeAdjustments?: Array<{
      previousAt?: Timestamp | null;
      newAt?: Timestamp | null;
      reason?: string;
      stage?: string;
      adjustedAt?: Timestamp | null;
    }>;
  };
  createdAt: Timestamp | null;
  acceptedAt: Timestamp | null;
  driverArrivedAt?: Timestamp | null;
  preparingAt: Timestamp | null;
  verifiedAt?: Timestamp | null;
  readyAt: Timestamp | null;
  pickedUpAt: Timestamp | null;
  deliveredAt: Timestamp | null;
  cancelledAt?: Timestamp | null;
  cancelReason?: string;
  cancelledBy?: string;
  cancelledByRole?: string;
  cancelledByName?: string;
}

export interface ShopProfile {
  id: string;
  name: string;
  shopTypeId: string;
  shopTypeName: string;
  description: string;
  address: string;
  latitude?: number;
  longitude?: number;
  country?: string;
  countryCode?: string;
  isoCode?: string;
  currency?: string;
  currencyCode?: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  ownerName: string;
  ownerEmail: string;
  logoUrl: string;
  bannerUrl: string;
  isOpen: boolean;
  isActive: boolean;
  isVerified: boolean;
  status: string;
  rating: number;
  totalRatings: number;
  deliveryFee: number;
  serviceChargePct: number;
  minimumOrder: number;
  estimatedDeliveryTime: string;
  fcmToken: string;
  openingHours: Record<string, { open: string; close: string; closed: boolean }>;
  createdAt: Timestamp | null;
}

export interface ShopMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
  invitedAt: Timestamp | null;
}

export interface ShopCategory {
  id: string;
  name: string;
  shopTypeId: string;
  iconEmoji: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Timestamp | null;
}

export interface ShopTypeConfig {
  id: string;
  name: string;
  addonsEnabled?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function productStatus(stock: number, isAvailable: boolean): ProductStatus {
  if (!isAvailable || stock === 0) return "Out of Stock";
  if (stock <= 10) return "Low Stock";
  return "Active";
}

function snapshotToProducts(snap: QuerySnapshot<DocumentData>): Product[] {
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      shopId: data.shopId ?? "",
      shopName: data.shopName ?? "",
      categoryId: data.categoryId ?? "",
      categoryName: data.categoryName ?? "",
      name: data.name ?? "",
      description: data.description ?? "",
      price: data.price ?? 0,
      unit: data.unit ?? "",
      imageUrl: data.imageUrl ?? "",
      isAvailable: data.isAvailable ?? true,
      isActive: data.isActive ?? true,
      stock: data.stock ?? 0,
      requiredProductIds: data.requiredProductIds ?? [],
      options: data.options ?? [],
      laundryPricingType: data.laundryPricingType ?? undefined,
      bundleSize: data.bundleSize ?? "",
      maxItems: data.maxItems ?? null,
      includedRule: data.includedRule ?? "",
      excludedRule: data.excludedRule ?? "",
      turnaroundHours: data.turnaroundHours ?? null,
      createdAt: data.createdAt ?? null,
      updatedAt: data.updatedAt ?? null,
      status: productStatus(data.stock ?? 0, data.isAvailable ?? true),
    } as Product;
  });
}

export function isConfirmedErrandOrder(data: Record<string, unknown>): boolean {
  const status = String(data.status ?? "").toLowerCase();
  if (!status || status === "payment_pending" || status === "payment_failed") return false;
  if (data.isPaymentDraft === true) return false;
  const paymentStatus = data.paymentStatus;
  const paidByStatus =
    paymentStatus === true || String(paymentStatus ?? "").toLowerCase() === "paid";
  return paidByStatus || data.paymentVerified === true;
}

export function storeOrderAmount(order: Pick<ErrandOrder, "businessGross" | "subtotal" | "items">): number {
  const businessGross = Number(order.businessGross ?? 0);
  if (businessGross > 0) return businessGross;
  const subtotal = Number(order.subtotal ?? 0);
  if (subtotal > 0) return subtotal;
  return (order.items ?? []).reduce((sum, item) => {
    const lineTotal = Number(item.total ?? 0);
    if (lineTotal > 0) return sum + lineTotal;
    return sum + Number(item.price ?? 0) * Number(item.qty ?? 1);
  }, 0);
}

function snapshotToOrders(snap: QuerySnapshot<DocumentData>): ErrandOrder[] {
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ErrandOrder))
    .filter((order) => isConfirmedErrandOrder(order as unknown as Record<string, unknown>));
}

// ── Products ───────────────────────────────────────────────────────────────

export function subscribeToProducts(
  shopId: string,
  callback: (products: Product[]) => void
) {
  const q = query(
    collection(db, "Products"),
    where("shopId", "==", shopId),
    where("isActive", "==", true)
  );
  return onSnapshot(q, (snap) => {
    const products = snapshotToProducts(snap).sort(
      (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
    );
    callback(products);
  });
}


export async function uploadProductImage(shopId: string, file: File): Promise<string> {
  validateBusinessImageFile(file);
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeName = file.name
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || "image";
  const uniquePart = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const imageRef = ref(storage, `shops/${shopId}/products/${uniquePart}-${safeName}.${ext}`);
  await uploadBytes(imageRef, file, {
    contentType: file.type || "image/jpeg",
    customMetadata: { shopId },
  });
  return getDownloadURL(imageRef);
}

export async function addProduct(
  shopId: string,
  shopName: string,
  data: Omit<Product, "id" | "shopId" | "shopName" | "createdAt" | "updatedAt" | "status">
): Promise<string> {
  const docRef = await addDoc(collection(db, "Products"), {
    ...data,
    shopId,
    shopName,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateProduct(productId: string, data: Partial<Product>): Promise<void> {
  await updateDoc(doc(db, "Products", productId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteProduct(productId: string): Promise<void> {
  await deleteDoc(doc(db, "Products", productId));
}

// ── Errand Orders ──────────────────────────────────────────────────────────

export function subscribeToOrders(
  shopId: string,
  callback: (orders: ErrandOrder[], newOrderIds: string[]) => void
) {
  // No orderBy — combining where + orderBy on different fields needs a composite
  // index that may not exist. Sort newest-first client-side instead.
  const q = query(
    collection(db, "ErrandOrders"),
    where("shopId", "==", shopId),
    limit(100)
  );

  let initialized = false;
  const knownConfirmedIds = new Set<string>();

  return onSnapshot(q, (snap) => {
    const orders = snapshotToOrders(snap).sort(
      (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
    );
    const newOrderIds: string[] = [];

    snap.docChanges().forEach((change) => {
      const data = { id: change.doc.id, ...change.doc.data() };
      const confirmed = isConfirmedErrandOrder(data);
      if (confirmed && initialized && !knownConfirmedIds.has(change.doc.id)) {
        newOrderIds.push(change.doc.id);
      }
      if (confirmed) knownConfirmedIds.add(change.doc.id);
    });

    initialized = true;
    callback(orders, newOrderIds);
  });
}

export async function updateOrderStatus(
  orderId: string,
  status: ErrandStatus,
  options: {
    cancelReason?: string;
    cancelledBy?: string;
    cancelledByRole?: string;
    cancelledByName?: string;
    intakeNote?: string;
    expectedReadyAt?: Date;
  } = {}
): Promise<void> {
  const updates: Record<string, unknown> = { status };
  if (status === "preparing") updates.preparingAt = serverTimestamp();
  if (status === "ready") updates.readyAt = serverTimestamp();
  if (status === "laundry_processing") {
    updates.laundryProcessingAt = serverTimestamp();
    if (options.expectedReadyAt) {
      updates["laundryDetails.expectedReadyAt"] = options.expectedReadyAt;
    }
    const note = options.intakeNote?.trim();
    if (note) {
      updates["laundryDetails.intakeNotes"] = arrayUnion({
        note,
        action: "Recorded during laundry intake",
        reason: "Store intake review",
        recordedAt: new Date(),
      });
    }
  }
  if (status === "laundry_ready_for_return") {
    updates.laundryReadyForReturnAt = serverTimestamp();
    updates.readyAt = serverTimestamp();
  }
  if (status === "cancelled") {
    updates.cancelledAt = serverTimestamp();
    updates.cancelReason = options.cancelReason?.trim() || "Cancelled by store";
    updates.cancelledBy = options.cancelledBy ?? "store";
    updates.cancelledByRole = options.cancelledByRole ?? "store";
    updates.cancelledByName = options.cancelledByName ?? "Store";
  }
  await updateDoc(doc(db, "ErrandOrders", orderId), updates);
}

/**
 * Adjust a laundry order's expected ready time. Writes the new time and an
 * audit entry; never deletes previous adjustments. The page enforces the
 * one-extension-per-order policy and the cap before calling this.
 */
export async function adjustReadyTime(
  orderId: string,
  previousAt: Date | null,
  newAt: Date,
  reason: string,
  stage: "intake" | "processing"
): Promise<void> {
  await updateDoc(doc(db, "ErrandOrders", orderId), {
    "laundryDetails.expectedReadyAt": newAt,
    "laundryDetails.readyTimeAdjustments": arrayUnion({
      previousAt,
      newAt,
      reason,
      stage,
      adjustedAt: new Date(),
    }),
  });
}

// ── Sponsored ads ──────────────────────────────────────────────────────────

export interface AdsConfig {
  enabled: boolean;
  requiresApproval: boolean;
  maxActiveAds: number;
  maxAdsPerBusiness: number;
  payWithBalance: boolean;
  payWithCard: boolean;
  activeCountries: string[];
  pricing: Record<string, { daily: number; weekly: number; currency: string }>;
}

export type AdStatus =
  | "draft" | "pending_review" | "active" | "paused" | "rejected" | "expired";

export interface BusinessAd {
  id: string;
  shopId: string;
  shopName: string;
  countryCode: string;
  state: string;
  targetType: "product" | "store";
  productId?: string;
  productImageUrl?: string;
  title: string;
  subtitle: string;
  bannerUrl: string;
  status: AdStatus;
  businessEnabled: boolean;
  pausedBy?: string;
  rejectReason?: string;
  days: number;
  amount: number;
  currency: string;
  startsAt: Timestamp | null;
  endsAt: Timestamp | null;
  impressions: number;
  clicks: number;
  createdAt: Timestamp | null;
}

export function subscribeToAdsConfig(callback: (cfg: AdsConfig | null) => void) {
  return onSnapshot(doc(db, "AdsConfig", "config"), (snap) => {
    if (!snap.exists()) return callback(null);
    const d = snap.data();
    callback({
      enabled: d.enabled === true,
      requiresApproval: d.requiresApproval !== false,
      maxActiveAds: d.maxActiveAds ?? 10,
      maxAdsPerBusiness: d.maxAdsPerBusiness ?? 1,
      payWithBalance: d.payWithBalance !== false,
      payWithCard: d.payWithCard === true,
      activeCountries: d.activeCountries ?? [],
      pricing: d.pricing ?? {},
    });
  }, () => callback(null));
}

/** Ads availability for one shop: feature on AND shop's country allowed AND priced. */
export function adsAvailableForShop(cfg: AdsConfig | null, countryCode?: string): boolean {
  if (!cfg || !cfg.enabled) return false;
  const cc = (countryCode ?? "").toUpperCase();
  if (!cc) return false;
  if (cfg.activeCountries.length && !cfg.activeCountries.includes(cc)) return false;
  return Boolean(cfg.pricing[cc]);
}

export function subscribeToMyAds(shopId: string, callback: (ads: BusinessAd[]) => void) {
  const q = query(collection(db, "BusinessAds"), where("shopId", "==", shopId));
  return onSnapshot(q, (snap) => {
    const ads = snap.docs.map((d) => ({ id: d.id, ...d.data() } as BusinessAd));
    ads.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
    callback(ads);
  }, () => callback([]));
}

/** Business-side pause/resume. Only flips between active and paused. */
export async function setAdPaused(adId: string, paused: boolean): Promise<void> {
  await updateDoc(doc(db, "BusinessAds", adId), {
    businessEnabled: !paused,
    status: paused ? "paused" : "active",
  });
}

/** Edit an ad's text. Title/subtitle only — duration, target and banner
 *  affect billing/review and are not editable in place. */
export async function updateAdText(adId: string, title: string, subtitle: string): Promise<void> {
  await updateDoc(doc(db, "BusinessAds", adId), {
    title: title.trim(),
    subtitle: subtitle.trim(),
  });
}

/** Delete an ad, freeing the business's ad slot. The charge already made is
 *  not refunded. */
export async function deleteAd(adId: string): Promise<void> {
  await deleteDoc(doc(db, "BusinessAds", adId));
}

// ── Shop Profile ───────────────────────────────────────────────────────────

export function subscribeToShop(
  shopId: string,
  callback: (shop: ShopProfile | null) => void
) {
  return onSnapshot(doc(db, "Shops", shopId), (snap) => {
    if (!snap.exists()) { callback(null); return; }
    callback({ id: snap.id, ...snap.data() } as ShopProfile);
  });
}

export function subscribeToShopType(
  shopTypeId: string,
  callback: (shopType: ShopTypeConfig | null) => void
) {
  return onSnapshot(doc(db, "ShopTypes", shopTypeId), (snap) => {
    if (!snap.exists()) { callback(null); return; }
    const data = snap.data();
    callback({
      id: snap.id,
      name: data.name ?? "",
      addonsEnabled: typeof data.addonsEnabled === "boolean" ? data.addonsEnabled : undefined,
    });
  });
}

export async function updateShopProfile(shopId: string, data: Partial<ShopProfile>): Promise<void> {
  await updateDoc(doc(db, "Shops", shopId), { ...data, updatedAt: serverTimestamp() });
  const syncRes = await fetch("/api/admin/shop-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shopId, ...data }),
  });
  if (!syncRes.ok) {
    const error = await syncRes.json().catch(() => null);
    throw new Error(error?.error || "Admin profile sync failed");
  }
}

export function subscribeToShopCategories(
  shopTypeId: string,
  callback: (categories: ShopCategory[]) => void
) {
  const q = query(
    collection(db, "ShopCategories"),
    where("shopTypeId", "==", shopTypeId),
    where("isActive", "==", true)
  );
  return onSnapshot(q, (snap) => {
    const categories = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name ?? "",
          shopTypeId: data.shopTypeId ?? "",
          iconEmoji: data.iconEmoji ?? "",
          description: data.description ?? "",
          isActive: data.isActive ?? true,
          sortOrder: data.sortOrder ?? 0,
          createdAt: data.createdAt ?? null,
        } as ShopCategory;
      })
      .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
    callback(categories);
  });
}

// ── Members ────────────────────────────────────────────────────────────────

export function subscribeToMembers(
  shopId: string,
  callback: (members: ShopMember[]) => void
) {
  const q = collection(db, "Shops", shopId, "members");
  return onSnapshot(q, (snap) => {
    const members = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ShopMember));
    callback(members);
  });
}

export async function addMember(shopId: string, member: Omit<ShopMember, "id">): Promise<void> {
  await addDoc(collection(db, "Shops", shopId, "members"), {
    ...member,
    invitedAt: serverTimestamp(),
  });
}

export async function updateMemberRole(shopId: string, memberId: string, role: string): Promise<void> {
  await updateDoc(doc(db, "Shops", shopId, "members", memberId), { role });
}

export async function updateMember(
  shopId: string,
  memberId: string,
  data: Partial<Pick<ShopMember, "firstName" | "lastName" | "email" | "role">>
): Promise<void> {
  await updateDoc(doc(db, "Shops", shopId, "members", memberId), data);
}

export async function resendMemberInvitation(shopId: string, memberId: string): Promise<void> {
  await updateDoc(doc(db, "Shops", shopId, "members", memberId), {
    invitedAt: serverTimestamp(),
  });
}

export async function removeMember(shopId: string, memberId: string): Promise<void> {
  await deleteDoc(doc(db, "Shops", shopId, "members", memberId));
}

// ── Analytics ─────────────────────────────────────────────────────────────

export async function getOrderStats(shopId: string) {
  const snap = await getDocs(
    query(collection(db, "ErrandOrders"), where("shopId", "==", shopId))
  );
  const orders = snapshotToOrders(snap);
  const total = orders.length;
  const completed = orders.filter((o) => o.status === "delivered").length;
  const pending = orders.filter((o) =>
    ["pending", "accepted", "driver_at_shop", "preparing", "ready", "picked_up"].includes(o.status)
  ).length;
  const cancelled = orders.filter((o) => o.status === "cancelled").length;
  const totalRevenue = orders
    .filter((o) => o.status === "delivered")
    .reduce((s, o) => s + storeOrderAmount(o), 0);
  const avgOrder = completed > 0 ? Math.round(totalRevenue / completed) : 0;
  return { total, completed, pending, cancelled, totalRevenue, avgOrder, orders };
}

// ── Business FAQs (managed by admin in the SwiftRun admin panel) ──────────────
export type BusinessFaq = { id: string; question: string; answer: string; order: number };

export async function getBusinessFaqs(): Promise<BusinessFaq[]> {
  const snap = await getDocs(collection(db, "businessFAQs"));
  const faqs = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      question: (data.question as string) ?? "",
      answer: (data.answer as string) ?? "",
      order: (data.order as number) ?? 0,
    };
  });
  faqs.sort((a, b) => a.order - b.order);
  return faqs;
}
