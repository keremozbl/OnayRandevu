import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * WhatsApp Business — Meta Cloud API gönderimi.
 *
 * İşletme-başlatımlı mesaj (hatırlatma) 24s oturum penceresi dışında yalnız
 * ONAYLANMIŞ şablonla gider; serbest metinle değil. Bu yüzden gönderim bir
 * "template" mesajıdır: şablon adı + dil + gövde parametreleri. Onay kurumun
 * kendi Meta WABA'sında yapılır; biz yalnız adını ve değişkenleri yollarız.
 *
 * Kimlik bilgisi (access_token) kuruma özeldir ve `tenant_whatsapp_secret`
 * tablosunda durur — buraya yalnız güvenilir sunucu kodu (worker/test, servis
 * rolü) okuyup geçirir. Kural 5: anahtar tarayıcıya hiç inmez.
 */

const GRAPH_VERSION = "v21.0";

export type WhatsAppCreds = {
  phoneNumberId: string;
  accessToken: string;
};

export type WhatsAppForSend = {
  enabled: boolean;
  planOk: boolean;
  creds: WhatsAppCreds | null;
};

/**
 * Telefon numarasını WhatsApp'ın beklediği biçime getirir: yalnız rakam, ülke
 * kodlu. Türkiye'de "05xx..." (11 hane, 0 ile) → "90xx...". Zaten ülke kodlu
 * numaraya dokunmaz. Boş/çok kısa → null.
 */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (digits.startsWith("0") && digits.length === 11) digits = "90" + digits.slice(1);
  return digits;
}

/**
 * Bir WhatsApp şablon mesajı gönderir. Başarıda sağlayıcı mesaj kimliğini
 * (`provider_ref`) döndürür; hata fırlatır (dispatch yakalar, satıra yazar).
 */
export async function sendWhatsAppTemplate(
  creds: WhatsAppCreds,
  input: {
    to: string;
    templateName: string;
    lang: string;
    /** Gövde {{1}}, {{2}} ... sırasıyla. */
    bodyParams: string[];
  },
): Promise<{ ref: string | null }> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${creds.phoneNumberId}/messages`;

  const components =
    input.bodyParams.length > 0
      ? [
          {
            type: "body",
            parameters: input.bodyParams.map((text) => ({ type: "text", text })),
          },
        ]
      : [];

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: input.to,
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.lang },
        ...(components.length > 0 ? { components } : {}),
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WhatsApp ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { messages?: { id?: string }[] };
  return { ref: data.messages?.[0]?.id ?? null };
}

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Bir kurumun WhatsApp gönderim bağlamını yükler (servis rolü): bağlantı açık
 * mı, planı uygun mu, kimlik bilgisi (token dahil) ne. Yalnız güvenilir sunucu
 * kodu çağırır — token'ı okuduğu için.
 */
export async function loadWhatsAppForSend(
  admin: AdminClient,
  tenantId: string,
): Promise<WhatsAppForSend> {
  const [{ data: cfg }, { data: sub }, { data: secret }] = await Promise.all([
    admin
      .from("tenant_whatsapp")
      .select("enabled, phone_number_id")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    admin.from("tenant_subscriptions").select("plan").eq("tenant_id", tenantId).maybeSingle(),
    admin
      .from("tenant_whatsapp_secret")
      .select("access_token")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  const planOk = sub?.plan === "ekip" || sub?.plan === "zincir";
  const enabled = Boolean(cfg?.enabled);
  const creds =
    cfg?.phone_number_id && secret?.access_token
      ? { phoneNumberId: cfg.phone_number_id, accessToken: secret.access_token }
      : null;

  return { enabled, planOk, creds };
}
