/**
 * İki tonlu marka yazısı — logodaki gibi "Onay" kalın, "Randevu" marka yeşili.
 *
 * Boyut, izleme (tracking) ve taban rengi dışarıdan `className` ile gelir; burada
 * yalnızca iki parçanın ağırlık ve renk ayrımı yapılır. İşaretle birlikte
 * kullanılır (`LogoMark`), ama yazıyı tek başına da verir.
 *
 * `mono`: marka yeşili yerine iki parça da içinde bulunduğu rengi (currentColor)
 * alır — yeşilin kaybolduğu renkli/koyu zeminlerde (ör. teal auth paneli) ad
 * tek renk ve okunur kalsın diye. Ağırlık ayrımı (Onay kalın) korunur.
 */
export function BrandName({
  className = "",
  mono = false,
}: {
  className?: string;
  mono?: boolean;
}) {
  return (
    <span className={className} translate="no">
      <span className="font-bold">Onay</span>
      <span className={mono ? "font-semibold" : "font-semibold text-brand"}>
        Randevu
      </span>
    </span>
  );
}
