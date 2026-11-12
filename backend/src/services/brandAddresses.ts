/** Business locations in the brand kit: several saved, one selected for flyers. */

export const MAX_BRAND_ADDRESSES = 5;
export const MAX_BRAND_ADDRESS_LEN = 160;

function clipOne(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_BRAND_ADDRESS_LEN);
}

/** Clean list from the save body or from JSON already on disk. Empty strings dropped; order kept; max 5. */
export function normalizeAddresses(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [raw];
          } catch {
            return [raw];
          }
        })()
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const text = clipOne(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= MAX_BRAND_ADDRESSES) break;
  }
  return out;
}

export type AddressBook = { list: string[]; selected: number };

function clampSelected(selected: unknown, length: number) {
  const n = Number(selected);
  if (!Number.isFinite(n) || length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, Math.trunc(n)));
}

/**
 * Addresses for this kit. Prefers `addresses_json` (array or `{ list, selected }`);
 * falls back to the old single `address` column.
 */
export function addressBookOf(brand?: {
  address?: string;
  addresses?: string[];
  addressSelected?: number;
  addresses_json?: string | null;
} | null): AddressBook {
  if (!brand) return { list: [], selected: 0 };

  if (brand.addresses_json != null && String(brand.addresses_json).trim()) {
    try {
      const parsed = JSON.parse(String(brand.addresses_json));
      if (Array.isArray(parsed)) {
        const list = normalizeAddresses(parsed);
        return { list, selected: clampSelected(brand.addressSelected, list.length) };
      }
      if (parsed && typeof parsed === "object") {
        const list = normalizeAddresses((parsed as { list?: unknown }).list ?? []);
        return { list, selected: clampSelected((parsed as { selected?: unknown }).selected ?? brand.addressSelected, list.length) };
      }
    } catch {
      /* fall through */
    }
  }

  if (Array.isArray(brand.addresses) && brand.addresses.length) {
    const list = normalizeAddresses(brand.addresses);
    return { list, selected: clampSelected(brand.addressSelected, list.length) };
  }

  const one = clipOne(brand.address);
  return one ? { list: [one], selected: 0 } : { list: [], selected: 0 };
}

export function addressesOf(brand?: Parameters<typeof addressBookOf>[0]) {
  return addressBookOf(brand).list;
}

/** The one address that goes on flyers / into AI — never the whole list. */
export function primaryAddress(brand?: Parameters<typeof addressBookOf>[0]) {
  const { list, selected } = addressBookOf(brand);
  return list[selected] || list[0] || "";
}

/** What to write on PUT: `address` = the selected line for older readers. */
export function addressesForSave(body: { address?: unknown; addresses?: unknown; addressSelected?: unknown }) {
  const fromList = body.addresses !== undefined ? normalizeAddresses(body.addresses) : null;
  const list = fromList ?? normalizeAddresses(body.address !== undefined ? [body.address] : []);
  const selected = clampSelected(body.addressSelected, list.length);
  return {
    list,
    selected,
    address: list[selected] || "",
    addresses_json: list.length ? JSON.stringify({ list, selected }) : "",
  };
}
