/**
 * İki tonlu marka yazısı — logodaki gibi "Onay" kalın, "Randevu" marka yeşili.
 *
 * Boyut, izleme (tracking) ve taban rengi dışarıdan `className` ile gelir; burada
 * yalnızca iki parçanın ağırlık ve renk ayrımı yapılır. İşaretle birlikte
 * kullanılır (`LogoMark`), ama yazıyı tek başına da verir.
 */
export function BrandName({ className = "" }: { className?: string }) {
  return (
    <span className={className} translate="no">
      <span className="font-bold">Onay</span>
      <span className="font-semibold text-brand">Randevu</span>
    </span>
  );
}
