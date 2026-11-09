import Link from "next/link";

import type { Interval } from "@/lib/domain";
import type { DaySchedule, ResourceDay } from "@/lib/scheduling/queries";
import { RESOURCE_KIND_LABELS } from "@/lib/scheduling/status";

import { AppointmentBlock } from "./appointment-block";
import { GridSurface } from "./grid-surface";
import { NowLine } from "./now-line";

/**
 * Gün ızgarası: solda zaman ekseni, sağda kaynak sütunları.
 *
 * Dikey ölçek tek bir CSS değişkeninde: `--ppm` (piksel/dakika, bir uzunluk).
 * Her konum "dakika sayısı × --ppm" olarak `calc` ile yazılır; ölçeği
 * `GridSurface` ayarlar — "sığdır" modunda günü ekrana oturtacak değer, "rahat"
 * modunda 30 dakika = 44px. Böylece ölçek değiştiğinde buradaki hiçbir konum
 * elle yeniden hesaplanmaz; `--ppm` değişince hepsi birlikte ölçeklenir.
 *
 * Konumlar sunucuda hesaplanmış `Date` değerlerinden çıkar (dakika olarak),
 * tarayıcının saat dilimi hiçbir şeyi kaydırmaz. Randevu blokları istemci
 * bileşeni (`appointment-block.tsx`) ve aynı `--ppm` ölçeğini kullanır:
 * sürüklenirken ve sunucu onayı beklenirken geçici konumda durabilmeleri
 * gerekiyor. Sütunlar, boş slotlar ve zaman ekseni sunucuda kalır.
 */
const SLOT_MINUTES = 30;

/** style özniteliğine 442.99999999999994 yazılmasın. */
const px = (value: number) => Math.round(value * 100) / 100;

/** Dikey konum: dakika sayısı × --ppm. Ölçek runtime'da --ppm'den gelir. */
const v = (minutes: number) => `calc(var(--ppm) * ${px(minutes)})`;

/** Bir slot (30 dk) yüksekliği, boş slot kutuları için — 1px çizgi payı düşülür. */
const SLOT_HEIGHT = `calc(var(--ppm) * ${SLOT_MINUTES} - 1px)`;

/** Saat ve yarım saat çizgileri: DOM yerine arka plan katmanı. */
const gridLines = {
  backgroundImage: [
    `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px calc(var(--ppm) * 60))`,
    `repeating-linear-gradient(to bottom, var(--surface-2) 0 1px, transparent 1px calc(var(--ppm) * ${SLOT_MINUTES}))`,
  ].join(", "),
};

/** İzin alanı: renk değil desen — siyah-beyaz çıktıda da ayırt edilir. */
const timeOffPattern = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--border) 0 1px, transparent 1px 7px)",
};

export function DayGrid({
  schedule,
  isToday,
  label,
  highlightId,
}: {
  schedule: DaySchedule;
  isToday: boolean;
  /** Okunur gün adı — ızgaranın ekran okuyucudaki adı ham tarih olmasın */
  label: string;
  /** Az önce oluşturulan randevu; ızgarada halkayla işaretlenir */
  highlightId?: string;
}) {
  const { timeZone, dayStartsAt, gridFromMinutes, gridToMinutes, resources } = schedule;
  const totalMinutes = gridToMinutes - gridFromMinutes;
  const bodyHeight = v(totalMinutes);

  const time = new Intl.DateTimeFormat("tr-TR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const minutesFromDayStart = (instant: Date) =>
    (instant.getTime() - dayStartsAt.getTime()) / 60_000;

  /** Izgaranın üstünden itibaren dakika; piksele dönüşüm `--ppm` ile CSS'te. */
  const offsetMinutes = (instant: Date) => minutesFromDayStart(instant) - gridFromMinutes;

  /** Izgara dışına taşan aralıklar kırpılır; taşan blok sütunu bozar. */
  const bandOf = (interval: Interval) => {
    const topMin = Math.max(0, offsetMinutes(interval.start));
    const bottomMin = Math.min(totalMinutes, offsetMinutes(interval.end));
    const heightMin = Math.max(bottomMin - topMin, 0);
    return { top: v(topMin), height: v(heightMin), heightMin };
  };

  const hours: number[] = [];
  for (let minute = gridFromMinutes; minute <= gridToMinutes; minute += 60) hours.push(minute);

  return (
    <GridSurface
      label={label}
      timeZone={timeZone}
      dayStartsAtMs={dayStartsAt.getTime()}
      gridFromMinutes={gridFromMinutes}
      gridToMinutes={gridToMinutes}
      stepMinutes={schedule.rules.slot_step_minutes}
    >
      <div className="flex w-full min-w-max pb-4">
        {/* zaman ekseni */}
        <div className="sticky left-0 z-30 w-14 shrink-0 bg-bg">
          <div className="sticky top-0 z-40 h-10 border-b border-border bg-bg" />
          <div className="relative" style={{ height: bodyHeight }}>
            {hours.map((minute) => (
              <span
                key={minute}
                className="absolute right-2 font-mono text-[11px] leading-none text-ink-3"
                style={{ top: `calc(${v(minute - gridFromMinutes)} + 3px)` }}
              >
                {time.format(new Date(dayStartsAt.getTime() + minute * 60_000))}
              </span>
            ))}
          </div>
        </div>

        {resources.map((day, index) => (
          <ResourceColumn
            key={day.resource.id}
            day={day}
            bodyHeight={bodyHeight}
            bandOf={bandOf}
            offsetMinutes={offsetMinutes}
            time={time}
            date={schedule.date}
            branchId={schedule.branch?.id ?? null}
            highlightId={highlightId}
            now={
              isToday ? (
                <NowLine
                  dayStartsAt={dayStartsAt}
                  gridFromMinutes={gridFromMinutes}
                  gridToMinutes={gridToMinutes}
                  showMarker={index === 0}
                />
              ) : null
            }
          />
        ))}
      </div>
    </GridSurface>
  );
}

function ResourceColumn({
  day,
  bodyHeight,
  bandOf,
  offsetMinutes,
  time,
  date,
  branchId,
  highlightId,
  now,
}: {
  day: ResourceDay;
  bodyHeight: string;
  bandOf: (interval: Interval) => { top: string; height: string; heightMin: number };
  offsetMinutes: (instant: Date) => number;
  time: Intl.DateTimeFormat;
  date: string;
  branchId: string | null;
  highlightId?: string;
  now: React.ReactNode;
}) {
  const { resource, freeSlots, openWindows, timeOff, appointments } = day;
  const closedAllDay = openWindows.length === 0;

  const newAppointmentHref = (startsAt: Date) => {
    const params = new URLSearchParams({
      tarih: date,
      saat: time.format(startsAt),
      kaynak: resource.id,
    });
    if (branchId) params.set("sube", branchId);
    return `/app/randevu/yeni?${params.toString()}`;
  };

  return (
    <div className="flex w-56 shrink-0 grow flex-col border-l border-border">
      <div className="sticky top-0 z-30 flex h-10 items-center gap-2 border-b border-border bg-bg px-2">
        {resource.color && (
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: resource.color }}
          />
        )}
        <span className="min-w-0 truncate font-medium text-ink">
          {resource.title ? `${resource.title} ` : ""}
          {resource.name}
        </span>
        {resource.kind !== "staff" && (
          <span className="shrink-0 font-mono text-[10px] uppercase text-ink-3">
            {RESOURCE_KIND_LABELS[resource.kind]}
          </span>
        )}
      </div>

      {/* Sürükleme hedefi: bırakılan sütun bu öznitelikten okunur */}
      <div
        data-column
        data-resource-id={resource.id}
        className="relative bg-surface-2 outline-accent data-[drop=true]:outline-2 data-[drop=true]:-outline-offset-2"
        style={{ height: bodyHeight }}
      >
        {openWindows.map((window) => {
          const band = bandOf(window);
          return (
            <div
              key={window.start.toISOString()}
              className="absolute inset-x-0 bg-surface"
              style={{ top: band.top, height: band.height }}
            />
          );
        })}

        {timeOff.map((leave) => {
          const band = bandOf(leave);
          if (band.heightMin <= 0) return null;
          return (
            <div
              key={leave.start.toISOString()}
              className="absolute inset-x-0 overflow-hidden"
              style={{ ...timeOffPattern, top: band.top, height: band.height }}
            >
              <span className="absolute left-1.5 top-0.5 rounded-sm bg-bg px-1 text-[10px] text-ink-2">
                İzin
              </span>
            </div>
          );
        })}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={gridLines}
        />

        {closedAllDay && (
          <p className="absolute inset-x-0 top-3 text-center text-[12px] text-ink-3">Kapalı</p>
        )}

        {freeSlots.map((startsAt) => (
          <Link
            key={startsAt.toISOString()}
            href={newAppointmentHref(startsAt)}
            aria-label={`${time.format(startsAt)} · ${resource.name} · yeni randevu`}
            className="group absolute inset-x-0.5 rounded-sm no-underline transition-colors duration-150 hover:bg-accent-soft"
            style={{ top: v(offsetMinutes(startsAt)), height: SLOT_HEIGHT }}
          >
            <span
              aria-hidden="true"
              className="flex h-full items-center justify-center text-[11px] text-accent opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              + randevu
            </span>
          </Link>
        ))}

        {appointments.map((appointment) => (
          <AppointmentBlock
            key={appointment.id}
            id={appointment.id}
            resourceId={appointment.resourceId}
            startsAtMs={appointment.startsAt.getTime()}
            durationMinutes={Math.round(
              (appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 60_000,
            )}
            bufferBeforeMin={Math.round(
              (appointment.startsAt.getTime() - appointment.blockedFrom.getTime()) / 60_000,
            )}
            bufferAfterMin={Math.round(
              (appointment.blockedTo.getTime() - appointment.endsAt.getTime()) / 60_000,
            )}
            status={appointment.status}
            customerName={
              appointment.isHold
                ? "Slot tutuluyor — online"
                : (appointment.customerName ?? "İsimsiz kayıt")
            }
            serviceName={appointment.serviceName}
            href={`/app/randevu/${appointment.id}${branchId ? `?sube=${branchId}` : ""}`}
            highlighted={appointment.id === highlightId}
            date={date}
            branchId={branchId}
            isHold={appointment.isHold}
          />
        ))}

        {now}
      </div>
    </div>
  );
}
