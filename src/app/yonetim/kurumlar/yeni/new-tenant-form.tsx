"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { createTenantAsAdminAction, type CreateTenantState } from "@/lib/platform/actions";

const EMPTY: CreateTenantState = {};

export function NewTenantForm({ templates }: { templates: { key: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createTenantAsAdminAction, EMPTY);

  return (
    <div className="flex flex-col gap-5">
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <form action={action} className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-[12px] font-medium uppercase tracking-wide text-ink-3">
            Kurum
          </legend>

          <Field id="name" label="Kurum adı" required>
            <Input id="name" name="name" placeholder="Örn: Pınar Güzellik" required />
          </Field>

          <Field
            id="slug"
            label="Randevu adresi"
            hint="onayrandevu.com/r/<adres> — küçük harf, rakam ve tire."
            required
          >
            <Input id="slug" name="slug" placeholder="pinar-guzellik" required />
          </Field>

          <Field id="template" label="Sektör" required>
            <Select id="template" name="template" defaultValue="" required>
              <option value="" disabled>
                Sektör seçin…
              </option>
              {templates.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        </fieldset>

        <fieldset className="flex flex-col gap-4 border-t border-border pt-5">
          <legend className="mb-1 text-[12px] font-medium uppercase tracking-wide text-ink-3">
            Sahip hesabı
          </legend>

          <Field id="full_name" label="Ad Soyad" required>
            <Input id="full_name" name="full_name" autoComplete="off" placeholder="Pınar Yıldız" required />
          </Field>

          <Field id="email" label="E-posta" hint="Giriş bu adresle yapılır." required>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              placeholder="pinar@ornek.com"
              required
            />
          </Field>

          <Field id="phone" label="Telefon" required>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="0532 123 45 67"
              required
            />
          </Field>

          <Field
            id="password"
            label="Parola"
            hint="En az 8 karakter. Müşteriye bu parolayı siz iletirsiniz."
            required
          >
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
        </fieldset>

        <p className="text-[12px] text-ink-3">
          Hesap doğrulanmış ve kurum <span className="font-medium text-ink-2">aktif</span> olarak
          açılır; e-posta doğrulaması beklenmez.
        </p>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="brand" size="md" disabled={pending}>
            {pending ? "Oluşturuluyor…" : "Kurumu oluştur"}
          </Button>
          <Link
            href="/yonetim/kurumlar"
            className="text-[13px] text-ink-2 no-underline hover:text-ink"
          >
            Vazgeç
          </Link>
        </div>
      </form>
    </div>
  );
}
