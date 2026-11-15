/**
 * Platform yöneticisi ekler ve listeler.
 *
 * `platform_admins` tablosunda INSERT politikası bilerek yok: kendini yönetici
 * yapabilen bir politika, yetkiyi anlamsız kılardı. Satır yalnızca servis
 * rolüyle, yani bu betikle eklenir.
 *
 *   node scripts/platform-admin.mjs listele
 *   node scripts/platform-admin.mjs ekle <e-posta> [etiket]
 *   node scripts/platform-admin.mjs sil  <e-posta>
 *   node scripts/platform-admin.mjs kur  <e-posta> [etiket]   (parola PAROLA env'inden)
 *
 * `kur`: hesabı yoksa açar (e-posta doğrulanmış doğar — e-posta altyapısı
 * beklenmez), varsa parolasını günceller, sonra platform yöneticisi yapar.
 * Parola argümanla değil `PAROLA` ortam değişkeniyle verilir; süreç listesinde
 * ve kabuk geçmişinde görünmesin.
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SECRET) {
  console.error("\nNEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli.\n");
  process.exit(1);
}

const admin = createClient(URL, SECRET, { auth: { persistSession: false } });

/** E-postadan kullanıcı kimliği. auth.users PostgREST'e kapalı, admin API kullanılıyor. */
async function findUser(email) {
  const wanted = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === wanted);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

const [command, email, label] = process.argv.slice(2);

switch (command) {
  case "listele": {
    const { data, error } = await admin
      .from("platform_admins")
      .select("user_id, label, created_at")
      .order("created_at");
    if (error) throw new Error(error.message);
    if (!data.length) {
      console.log("\nHiç platform yöneticisi yok.\n");
      break;
    }
    console.log("");
    for (const row of data) {
      const { data: user } = await admin.auth.admin.getUserById(row.user_id);
      console.log(`  ${user?.user?.email ?? row.user_id}${row.label ? ` · ${row.label}` : ""}`);
    }
    console.log("");
    break;
  }

  case "ekle": {
    if (!email) throw new Error("E-posta gerekli: node scripts/platform-admin.mjs ekle <e-posta>");
    const user = await findUser(email);
    if (!user) throw new Error(`Böyle bir kullanıcı yok: ${email} — önce hesabı açılmalı.`);
    const { error } = await admin
      .from("platform_admins")
      .upsert({ user_id: user.id, label: label ?? null });
    if (error) throw new Error(error.message);
    console.log(`\n${email} platform yöneticisi oldu.\n`);
    break;
  }

  case "kur": {
    if (!email) throw new Error("E-posta gerekli: node scripts/platform-admin.mjs kur <e-posta>");
    const parola = process.env.PAROLA;
    if (!parola || parola.length < 8) {
      throw new Error("PAROLA ortam değişkeni gerekli (en az 8 karakter).");
    }

    let user = await findUser(email);
    if (user) {
      const { error } = await admin.auth.admin.updateUserById(user.id, {
        password: parola,
        email_confirm: true,
      });
      if (error) throw new Error(error.message);
      console.log(`\n${email} zaten vardı; parolası güncellendi.`);
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password: parola,
        email_confirm: true,
      });
      if (error || !data?.user) throw new Error(error?.message ?? "Hesap oluşturulamadı.");
      user = data.user;
      console.log(`\n${email} hesabı açıldı (e-posta doğrulanmış).`);
    }

    const { error: adminErr } = await admin
      .from("platform_admins")
      .upsert({ user_id: user.id, label: label ?? null });
    if (adminErr) throw new Error(adminErr.message);
    console.log(`${email} platform yöneticisi oldu. Artık /giris → /yonetim.\n`);
    break;
  }

  case "sil": {
    if (!email) throw new Error("E-posta gerekli: node scripts/platform-admin.mjs sil <e-posta>");
    const user = await findUser(email);
    if (!user) throw new Error(`Böyle bir kullanıcı yok: ${email}`);
    const { error } = await admin.from("platform_admins").delete().eq("user_id", user.id);
    if (error) throw new Error(error.message);
    console.log(`\n${email} artık platform yöneticisi değil.\n`);
    break;
  }

  default:
    console.error("\nKullanım: node scripts/platform-admin.mjs <listele|ekle|sil> [e-posta] [etiket]\n");
    process.exit(1);
}
