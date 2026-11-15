import type { Metadata } from "next";
import Link from "next/link";

import { listTemplates } from "@/lib/templates";
import { NewTenantForm } from "./new-tenant-form";

export const metadata: Metadata = { title: "Yeni kurum" };

export default function YeniKurumSayfasi() {
  const templates = listTemplates().map((t) => ({ key: t.key, name: t.label }));

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <Link
          href="/yonetim/kurumlar"
          className="text-[13px] text-ink-2 no-underline hover:text-ink"
        >
          ‹ Kurumlar
        </Link>
        <h1 className="text-lg tracking-tight">Yeni kurum oluştur</h1>
        <p className="text-[13px] text-ink-2">
          Müşteri hesabını ve kurumu siz açarsınız; kurum doğrudan aktif başlar.
        </p>
      </div>

      <NewTenantForm templates={templates} />
    </div>
  );
}
