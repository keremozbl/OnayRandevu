/**
 * Transactional e-posta gönderimi — Resend HTTP API (bağımlılıksız `fetch`).
 *
 * Bilinçli DORMANT: `RESEND_API_KEY` tanımlı DEĞİLKEN gerçekten göndermez,
 * mesajı sunucu günlüğüne yazar ve `via: "log"` döner. Böylece ESP sözleşmesi
 * (Resend hesabı) ve `onayrandevu.com` DNS'i (SPF/DKIM/DMARC) hazır olmadan da
 * uygulama çalışır, çökmez ve "gönderdim" diye yalan söylemez (bkz
 * `notifications/providers.ts` log sağlayıcı felsefesi).
 *
 * Anahtar eklendiğinde (Kerem ESP+DNS'i kurunca) hiçbir kod değişmeden gönderim
 * aktifleşir. Gönderici `EMAIL_FROM` env'inden; varsayılan `noreply@onayrandevu.com`.
 *
 * Kural 5: anahtar `NEXT_PUBLIC_` ön eki ALMAZ — bu modül yalnız sunucuda.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type EmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  /** Düz metin alternatifi; verilmezse HTML'den türetilmez, boş gider. */
  text?: string;
  /** İnsan-yanıtlı adres: transactional `noreply@`, yanıtlar `iletisim@`. */
  replyTo?: string;
};

export type EmailResult = {
  ok: boolean;
  /** Sağlayıcının kayıt numarası (mutabakat/destek) — log modunda null. */
  ref: string | null;
  via: "resend" | "log";
  error?: string;
};

/** Gönderici başlığı. "Ad <adres>" biçimi Resend'de geçerli. */
export function emailFrom(): string {
  return process.env.EMAIL_FROM?.trim() || "OnayRandevu <noreply@onayrandevu.com>";
}

/** Gerçekten gönderen bir yapılandırma var mı — arayüz/akış bunu açıkça bilir. */
export function isEmailLive(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/**
 * Bir transactional e-posta gönderir. Anahtar yoksa loglar ve `via: "log"`
 * döner (başarı sayılır: akışı bloklamaz). Gönderim hatası `ok: false` döner;
 * çağıran karar verir (kuyruk tekrar dener, tek seferlik uyarı yutar).
 */
export async function sendTransactionalEmail(input: EmailInput): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  const to = Array.isArray(input.to) ? input.to : [input.to];

  if (!key) {
    console.info(
      `[eposta:log] → ${to.join(", ")} · ${input.subject}\n` +
        (input.text ?? input.html),
    );
    return { ok: true, ref: null, via: "log" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom(),
        to,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        ref: null,
        via: "resend",
        error: `Resend ${res.status}: ${body.slice(0, 300)}`,
      };
    }

    const data = (await res.json()) as { id?: string };
    return { ok: true, ref: data.id ?? null, via: "resend" };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, ref: null, via: "resend", error: message };
  }
}

/**
 * Düz metni basit, güvenli HTML gövdesine çevirir: kaçışlar + satır sonları.
 * Bildirim şablonları düz metin yazıldığı için e-posta kanalında HTML buradan
 * türetilir. Zengin şablon gerekmez; okunur ve XSS'siz yeterli.
 */
export function textToHtml(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  return (
    `<!DOCTYPE html><html lang="tr"><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;` +
    `font-size:15px;line-height:1.5;color:#1a1a1a;max-width:560px;margin:0 auto;padding:16px">` +
    `${paragraphs}</body></html>`
  );
}
