import Link from "next/link";

/**
 * Giriş/kayıt sayfalarında demoya davet eden yönlendirme.
 *
 * Tereddüt eden ziyaretçiyi hesap açmadan önce canlı demoya gönderir. Hedef
 * pazarlama sayfasındaki `/#demo` çapası (demo bölümü oradaki tek yer — açıksa
 * anında başlatır, değilse talep formu gösterir). İkincil bir eylem olduğu için
 * düğme değil düşük kontrastlı bir satır; birincil eylem formun kendisi.
 */
export function AuthDemoInvite() {
  return (
    <Link
      href="/#demo"
      className="group flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3 no-underline transition-colors hover:border-brand-line hover:bg-brand-tint"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-5 shrink-0 text-brand"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M10 9.2v5.6l4.4-2.8z" fill="currentColor" stroke="none" />
      </svg>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[13px] font-medium text-ink">
          Önce ürünü görmek ister misiniz?
        </span>
        <span className="text-[12px] text-ink-2">
          Canlı demo — kayıt istemez, bir dakika sürer.
        </span>
      </span>
      <svg
        viewBox="0 0 24 24"
        className="size-4 shrink-0 text-ink-3 transition-colors group-hover:text-brand"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </Link>
  );
}
