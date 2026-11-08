import type { SectorSlide } from "@/lib/marketing/sectors";

import { SectorIllustration } from "./sector-illustration";

/**
 * Seçili sektörün ayrıntı paneli — seçicinin (çark / sekme / deste) altında
 * duran, sektörü somutlaştıran kısım. Seçiciden BAĞIMSIZ: hangi seçim deseni
 * olursa olsun aynı panel kullanılır, böylece desenleri yalnız seçim kısmında
 * karşılaştırabiliyoruz. Durum tutmaz; yalnız `slide`'ı çizer.
 */

const TONES = {
  confirmed: "border-l-st-confirmed bg-st-confirmed-soft",
  pending: "border-l-st-pending bg-st-pending-soft",
  arrived: "border-l-st-arrived bg-st-arrived-soft",
} as const;

const ROW_H = 2.5; // rem — önizleme ızgarasında yarım saat

export function SectorPanel({ slide, showHeader = true }: { slide: SectorSlide; showHeader?: boolean }) {
  return (
    <div
      id="sektor-panel"
      role="tabpanel"
      aria-labelledby={`sektor-tab-${slide.key}`}
      tabIndex={0}
      className="rounded-lg border border-border bg-surface p-5 sm:p-7"
    >
      <div
        key={slide.key}
        className="grid animate-[sektor-giris_220ms_ease-out] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-12"
      >
        <div className="flex min-w-0 flex-col gap-5">
          {showHeader && (
            <div className="flex flex-col gap-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
                {slide.familyLabel}
              </p>
              <h3 className="text-[22px] font-semibold tracking-tight text-ink">{slide.label}</h3>
              <p className="text-[15px] leading-relaxed text-ink-2">{slide.description}</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
              Kurulumda gelen {slide.terms.service.toLocaleLowerCase("tr-TR")}
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {slide.services.map((service) => (
                <li
                  key={service.name}
                  className="flex items-baseline gap-1.5 rounded border border-border bg-surface-2 px-2 py-1 text-[13px] text-ink"
                >
                  <span className="min-w-0 truncate">{service.name}</span>
                  <span data-numeric className="font-mono text-[11px] text-ink-3">
                    {service.duration}dk
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <DayPreview slide={slide} />

          {slide.note && (
            <p className="border-l-2 border-brand-line pl-3 text-[13px] leading-relaxed text-ink-3">
              {slide.note}
            </p>
          )}

          <p data-numeric className="mt-auto text-[13px] text-ink-3">
            {slide.fieldCount} sektöre özel alan
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <SectorIllustration sector={slide.key} />
          {slide.reminder && (
            <div className="rounded border border-border bg-surface-2 p-3">
              <p className="pb-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
                Hatırlatma metni
              </p>
              <p className="text-[13px] leading-relaxed text-ink">{slide.reminder}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Sektörün kendi hizmetleriyle çizilmiş yarım günlük takvim. */
export function DayPreview({ slide }: { slide: SectorSlide }) {
  const columns = slide.columns.length > 0 ? slide.columns : ["Uzman 1"];

  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded border border-border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
    >
      <div className="border-b border-border bg-surface-2 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-ink-3">
          Bugün · Merkez
        </span>
      </div>

      <div
        className="grid text-[12px]"
        style={{ gridTemplateColumns: `3.25rem repeat(${columns.length}, minmax(0, 1fr))` }}
      >
        <div className="border-b border-border" />
        {columns.map((column) => (
          <div
            key={column}
            className="min-w-0 truncate border-b border-l border-border px-2 py-1.5 font-medium text-ink"
          >
            {column}
          </div>
        ))}

        <div className="flex flex-col">
          {slide.rows.map((row) => (
            <div
              key={row}
              className="border-b border-border px-2 pt-0.5 text-right font-mono text-[11px] text-ink-3"
              style={{ height: `${ROW_H}rem` }}
            >
              {row}
            </div>
          ))}
        </div>

        {columns.map((column, columnIndex) => (
          <div key={column} className="relative border-l border-border">
            {slide.rows.map((row) => (
              <div key={row} className="border-b border-border" style={{ height: `${ROW_H}rem` }} />
            ))}
            {slide.blocks
              .filter((block) => block.column === columnIndex)
              .map((block) => (
                <div
                  key={`${block.service}-${block.row}`}
                  className={`absolute inset-x-1 overflow-hidden rounded-sm border-l-2 px-1.5 py-1 ${TONES[block.tone]}`}
                  style={{
                    top: `${block.row * ROW_H + 0.15}rem`,
                    height: `${block.span * ROW_H - 0.3}rem`,
                  }}
                >
                  <p className="truncate text-[12px] font-medium text-ink">{block.service}</p>
                  <p className="truncate text-[11px] text-ink-2">{block.who}</p>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
