import assert from "node:assert/strict";
import { test } from "node:test";

import { PLAN_CATALOG, PLAN_KEYS } from "../plans.ts";
import { PLANS } from "./content.ts";

/**
 * Pazarlama fiyat kartları (`PLANS`) artık plan kataloğundan (`PLAN_CATALOG`)
 * türetiliyor — ad, aylık fiyat ve limit sayıları tek kaynakta. Bu test iki
 * kaynağın kaymadığını ve bilinen değerlerin aynen korunduğunu doğruluyor.
 */

const nf = new Intl.NumberFormat("tr-TR");

test("her plan anahtarının bir kartı var, sırası katalogla aynı", () => {
  assert.deepEqual(
    PLANS.map((p) => p.key),
    [...PLAN_KEYS],
  );
});

test("ad ve aylık fiyat katalogtan geliyor", () => {
  for (const plan of PLANS) {
    const meta = PLAN_CATALOG[plan.key as keyof typeof PLAN_CATALOG];
    assert.equal(plan.name, meta.name, `${plan.key} adı katalogla eşleşmeli`);
    assert.equal(plan.monthly, meta.monthly, `${plan.key} fiyatı katalogla eşleşmeli`);
  }
});

test("limit değerleri katalog sayılarından türetiliyor (null → metin)", () => {
  // Hangi etiket hangi katalog alanına dayanıyor — pazarlama tanımıyla aynı.
  const fieldByLabel: Record<string, "users" | "resources" | "monthlyReminders"> = {
    Kullanıcı: "users",
    "Uzman / kaynak": "resources",
    Şube: "resources",
    "Aylık hatırlatma": "monthlyReminders",
  };
  const unlimitedByField = {
    users: "sınırsız",
    resources: "sınırsız",
    monthlyReminders: "kullanım kadar",
  } as const;

  for (const plan of PLANS) {
    const meta = PLAN_CATALOG[plan.key as keyof typeof PLAN_CATALOG];
    for (const limit of plan.limits) {
      const field = fieldByLabel[limit.label];
      assert.ok(field, `bilinmeyen limit etiketi: ${limit.label}`);
      const raw = meta.limits[field];
      const expected = raw === null ? unlimitedByField[field] : nf.format(raw);
      assert.equal(limit.value, expected, `${plan.key} · ${limit.label} değeri`);
    }
  }
});

test("bilinen değerler korunuyor (regresyon)", () => {
  const byKey = Object.fromEntries(PLANS.map((p) => [p.key, p]));

  assert.equal(byKey.tek_uzman.monthly, 890);
  assert.deepEqual(
    byKey.tek_uzman.limits.map((l) => l.value),
    ["2", "1", "500"],
  );

  assert.equal(byKey.ekip.monthly, 1890);
  assert.equal(byKey.ekip.highlight, true);
  assert.deepEqual(
    byKey.ekip.limits.map((l) => l.value),
    ["10", "6", "3.000"],
  );

  assert.equal(byKey.zincir.monthly, null);
  assert.deepEqual(
    byKey.zincir.limits.map((l) => ({ label: l.label, value: l.value })),
    [
      { label: "Kullanıcı", value: "sınırsız" },
      { label: "Şube", value: "sınırsız" },
      { label: "Aylık hatırlatma", value: "kullanım kadar" },
    ],
  );
});
