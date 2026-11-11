/**
 * Marka işareti: "O" harfini de temsil eden yeşil çember + kalın onay tiki;
 * tikin uzun kolu sağ üstten çemberi aşar, çemberin sağ yanı tikin geçtiği yerde
 * açıktır (tik çembere değmez). İşletmenin logosundan (`tasarim/OnayRandevu_Logo`)
 * temiz vektör olarak yeniden çizildi — yazı ve koyu sunum zemini ayıklandı.
 *
 * Tik dolu/kalın: köşeli (miter) alt uç, düz (butt) küt uçlar. Renk marka yeşili
 * (`var(--brand)`), her iki temada uyumlu; zemin şeffaf, metnin yanında
 * çizgi-işaret olarak oturur. Favicon aynı işaret, koyu rozet içinde sabit
 * renkli (`src/app/icon.svg`).
 *
 * Boyut dışarıdan `className` ile verilir (kare: ör. `size-6`).
 */
export function LogoMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="var(--brand)"
      aria-hidden="true"
    >
      <path
        d="M 70.2 72.4 A 32 32 0 1 1 53.0 22.7"
        strokeWidth="7.5"
        strokeLinecap="round"
      />
      <path
        d="M 26 49 L 41 65 L 84 17"
        strokeWidth="14"
        strokeLinejoin="miter"
        strokeLinecap="butt"
        strokeMiterlimit="10"
      />
    </svg>
  );
}
