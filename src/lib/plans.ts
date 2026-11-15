/**
 * Plan kataloğu — tek kaynak.
 *
 * Plan tanımları KODDA yaşar (sektörden bağımsız motor felsefesi); veritabanı
 * yalnız seçili plan ANAHTARINI tutar (`tenant_subscriptions.plan`, check kısıtı
 * aynı anahtarlarla). Anahtar eklemek: buraya satır + migration'daki check kısıtı.
 *
 * NOT: pazarlama sitesi hâlâ kendi zengin `PLANS` listesini tutuyor
 * (`src/lib/marketing/content.ts` — fit, includes, limits). Anahtarlar ve adlar
 * burayla aynı olmalı; ileride o liste de buradan beslenmeli (açık iş).
 */

export const PLAN_KEYS = ["tek_uzman", "ekip", "zincir"] as const;

export type PlanKey = (typeof PLAN_KEYS)[number];

/**
 * Plan limitleri. `null` = sınırsız. Değerler pazarlama `PLANS` ile aynı olmalı
 * (tek kaynağa indirme açık iş). Kullanım bu limitlerle karşılaştırılır:
 * - users            ← aktif üyelik sayısı
 * - resources        ← aktif personel/kaynak sayısı
 * - monthlyReminders ← son 30 günde gönderilen bildirim (hatırlatma) proxy'si
 */
export type PlanLimits = {
  users: number | null;
  resources: number | null;
  monthlyReminders: number | null;
};

export type PlanMeta = {
  key: PlanKey;
  name: string;
  /** Aylık fiyat (TL). `null` = teklif usulü. Fiyatlar TASLAK (PRICING_IS_DRAFT). */
  monthly: number | null;
  limits: PlanLimits;
};

export const PLAN_CATALOG: Record<PlanKey, PlanMeta> = {
  tek_uzman: {
    key: "tek_uzman",
    name: "Tek Uzman",
    monthly: 890,
    limits: { users: 2, resources: 1, monthlyReminders: 500 },
  },
  ekip: {
    key: "ekip",
    name: "Ekip",
    monthly: 1890,
    limits: { users: 10, resources: 6, monthlyReminders: 3000 },
  },
  zincir: {
    key: "zincir",
    name: "Zincir",
    monthly: null,
    limits: { users: null, resources: null, monthlyReminders: null },
  },
};

export const PLAN_LIST: PlanMeta[] = PLAN_KEYS.map((k) => PLAN_CATALOG[k]);

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && (PLAN_KEYS as readonly string[]).includes(value);
}

export function planName(key: string | null | undefined): string {
  return key && isPlanKey(key) ? PLAN_CATALOG[key].name : "—";
}

export function planLimits(key: string | null | undefined): PlanLimits | null {
  return key && isPlanKey(key) ? PLAN_CATALOG[key].limits : null;
}

/**
 * Bir kullanım değerini limitle karşılaştırır. `limit` null ise sınırsız:
 * oran 0, asla aşım. Aksi halde oran [0,1] (gösterim için kırpılı) ve gerçek
 * aşım bayrağı (used > limit).
 */
export function quota(
  used: number,
  limit: number | null,
): { used: number; limit: number | null; ratio: number; over: boolean; unlimited: boolean } {
  if (limit == null) {
    return { used, limit: null, ratio: 0, over: false, unlimited: true };
  }
  const ratio = limit <= 0 ? 1 : Math.min(used / limit, 1);
  return { used, limit, ratio, over: used > limit, unlimited: false };
}
