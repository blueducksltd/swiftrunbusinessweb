const SHOP_ID_KEY = "swiftrun_shop_id";
const SHOP_NAME_KEY = "swiftrun_shop_name";

export function getShopId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SHOP_ID_KEY);
}

export function getShopName(): string {
  if (typeof window === "undefined") return "My Shop";
  return localStorage.getItem(SHOP_NAME_KEY) ?? "My Shop";
}

export function setSession(shopId: string, shopName: string): void {
  localStorage.setItem(SHOP_ID_KEY, shopId);
  localStorage.setItem(SHOP_NAME_KEY, shopName);
}

export function clearSession(): void {
  localStorage.removeItem(SHOP_ID_KEY);
  localStorage.removeItem(SHOP_NAME_KEY);
}
