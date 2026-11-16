import { NextResponse } from "next/server";

import { runSubscriptionLifecycle } from "@/lib/subscriptions/lifecycle";

/**
 * Abonelik yaşam döngüsü uç noktası — günlük (Vercel Cron, `vercel.json`).
 *
 * Denemesi dolmak üzere olan kurumları uyarır (sahibe e-posta + işaret), ek
 * günü de geçmişleri arşivler (suspend). Kimlik `Authorization: Bearer
 * <CRON_SECRET>` — bildirim kuyruğu uç noktasıyla aynı desen.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cronSecret(): string | undefined {
  return process.env.CRON_SECRET ?? process.env.NOTIFY_CRON_SECRET;
}

async function handle(request: Request): Promise<NextResponse> {
  const secret = cronSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET tanımlı değil; yaşam döngüsü kapalı." },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  try {
    const report = await runSubscriptionLifecycle();
    return NextResponse.json(report);
  } catch (cause) {
    // Ayrıntı sunucu günlüğüne; dışarı genel mesaj (CANLIYA-GECIS B7).
    console.error("[abonelik] yaşam döngüsü çalıştırılamadı", cause);
    return NextResponse.json({ error: "Yaşam döngüsü çalıştırılamadı" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
