"use client";

import Link from "next/link";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";

import type { SectorSlide } from "@/lib/marketing/sectors";

import { SectorPanel } from "./sector-panel";

/**
 * Sektör seçici — SEGMENTED TABS.
 *
 * Çarkın (eski `SectorCarousel`) yerini aldı: tek seferde bir sektör, net. Üstte
 * sade bir sekme şeridi, altında sektörü somutlaştıran panel 220ms yumuşak
 * girişle değişir. Hareket yok; masaüstü ve mobil aynı deseni kullanır, dar
 * ekranda şerit yatay kayar.
 *
 * Seçim adres çubuğuna `?sektor=` olarak yazılır — ama `router.replace` ile
 * DEĞİL: bu sayfa statik üretiliyor, her seçimde sunucuya tur attırmanın anlamı
 * yok. `history.replaceState` bağlantıyı paylaşılabilir yapar ve aşağıdaki canlı
 * demo bölümü (`DemoStart`) aynı parametreyi okuyarak kullanıcının sektörünü
 * seçili getirir. Çark da bunu böyle yapıyordu; davranış korunuyor.
 *
 * Seçili sektör TÜRETİLİR: kullanıcı henüz dokunmadıysa adres çubuğundaki
 * `?sektor=`, dokunduysa `picked`. Geri tuşu `picked`'i popstate geri
 * çağrısında temizler — effect gövdesinde değil (react-hooks kuralı).
 *
 * Erişim: gerçek `tablist` + roving tabindex; ok tuşları, Home/End gezinir
 * (Web Interface Guidelines). Seçili olmayan sekmeler `tabIndex=-1`, böylece Tab
 * bir kez şeride girer, oklar içeride dolaşır.
 */

function subscribeToUrl(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function readSectorFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("sektor");
}

export function SectorTabs({ slides }: { slides: SectorSlide[] }) {
  const count = slides.length;

  const urlKey = useSyncExternalStore(subscribeToUrl, readSectorFromUrl, () => null);
  const fromUrl = slides.findIndex((slide) => slide.key === urlKey);

  const [picked, setPicked] = useState<number | null>(null);
  const index = picked ?? (fromUrl >= 0 ? fromUrl : 0);

  const stripRef = useRef<HTMLDivElement>(null);

  const writeUrl = useCallback((key: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("sektor", key);
    window.history.replaceState(null, "", url);
  }, []);

  const select = useCallback(
    (next: number, focus = false) => {
      const i = ((next % count) + count) % count;
      setPicked(i);
      writeUrl(slides[i].key);
      const tab = stripRef.current?.querySelector<HTMLButtonElement>(`#sektor-tab-${slides[i].key}`);
      tab?.scrollIntoView({ block: "nearest", inline: "center" });
      if (focus) tab?.focus();
    },
    [count, slides, writeUrl],
  );

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") select(index + 1, true);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") select(index - 1, true);
    else if (event.key === "Home") select(0, true);
    else if (event.key === "End") select(count - 1, true);
    else return;
    event.preventDefault();
  }

  const chosen = slides[index];

  return (
    <div className="flex flex-col gap-8">
      <div
        ref={stripRef}
        role="tablist"
        aria-label="Sektörler"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        // Mobilde 2 sütunlu ızgara: altı sektör de tek bakışta görünür.
        // Eskiden tek satır yatay kayan bir şeritti — gizli scrollbar'la çoğu
        // sektör ekran dışında kalıyordu. ≥sm'de yine kayan tek satır şerit.
        className="grid grid-cols-2 gap-1.5 sm:-mx-1 sm:flex sm:overflow-x-auto sm:px-1 sm:pb-1 sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, position) => {
          const active = position === index;
          return (
            <button
              key={slide.key}
              id={`sektor-tab-${slide.key}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="sektor-panel"
              tabIndex={active ? 0 : -1}
              onClick={() => select(position)}
              className={`flex flex-col gap-0.5 rounded-lg border px-4 py-2.5 text-left transition-[background-color,border-color,color] duration-150 sm:shrink-0 ${
                active
                  ? "border-brand bg-brand text-brand-ink"
                  : "border-border bg-surface text-ink-2 [@media(hover:hover)]:hover:border-border-strong [@media(hover:hover)]:hover:text-ink"
              }`}
            >
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
                  active ? "text-brand-ink/70" : "text-ink-3"
                }`}
              >
                {slide.familyLabel}
              </span>
              <span className="text-[14px] font-medium sm:whitespace-nowrap">{slide.label}</span>
            </button>
          );
        })}
      </div>

      <SectorPanel slide={chosen} />

      <div>
        <Link
          href="#demo"
          className="inline-flex h-10 items-center justify-center rounded border border-brand bg-brand px-4 text-[14px] font-medium text-brand-ink no-underline transition-colors duration-150 hover:border-brand-strong hover:bg-brand-strong"
        >
          Bu Sektörle Demoyu Başlatın
        </Link>
      </div>
    </div>
  );
}
