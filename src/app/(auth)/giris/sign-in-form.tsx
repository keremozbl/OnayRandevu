"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { AuthDemoInvite } from "@/components/auth-demo-invite";
import { sendMagicLink, signIn, type AuthState } from "@/lib/auth/actions";

const EMPTY: AuthState = {};

export function SignInForm({ initialError }: { initialError?: string }) {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [pwState, pwAction, pwPending] = useActionState(signIn, EMPTY);
  const [linkState, linkAction, linkPending] = useActionState(
    sendMagicLink,
    EMPTY,
  );

  const state = mode === "password" ? pwState : linkState;
  const pending = mode === "password" ? pwPending : linkPending;
  const error = state.error ?? initialError;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl tracking-tight">Giriş yapın</h1>
        <p className="text-ink-2">Kurumunuzun paneline erişin.</p>
      </div>

      <AuthDemoInvite />

      {error && <Alert tone="error">{error}</Alert>}
      {state.notice && <Alert tone="success">{state.notice}</Alert>}

      {mode === "password" ? (
        <form action={pwAction} className="flex flex-col gap-4">
          <Field id="email" label="E-posta" required>
            <Input
              size="lg"
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              spellCheck={false}
              placeholder="ornek@klinik.com"
              required
            />
          </Field>

          <Field id="password" label="Parola" required>
            <Input
              size="lg"
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>

          {/* Buton istek başlayana kadar etkin kalır, sonra durumu gösterir */}
          <Button
            type="submit"
            variant="brand"
            size="lg"
            className="mt-1 w-full"
            disabled={pending}
          >
            {pending ? "Giriş yapılıyor…" : "Giriş Yap"}
          </Button>
        </form>
      ) : (
        <form action={linkAction} className="flex flex-col gap-4">
          <Field
            id="magic-email"
            label="E-posta"
            hint="Parola yerine tek kullanımlık giriş bağlantısı göndeririz."
            required
          >
            <Input
              size="lg"
              id="magic-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              spellCheck={false}
              placeholder="ornek@klinik.com"
              required
            />
          </Field>

          <Button
            type="submit"
            variant="brand"
            size="lg"
            className="mt-1 w-full"
            disabled={pending}
          >
            {pending ? "Gönderiliyor…" : "Giriş Bağlantısı Gönder"}
          </Button>
        </form>
      )}

      <div className="flex flex-col gap-3 border-t border-border pt-4 text-[13px]">
        <button
          type="button"
          onClick={() => setMode(mode === "password" ? "link" : "password")}
          className="self-start text-brand underline underline-offset-2"
        >
          {mode === "password"
            ? "Parola yerine e-posta bağlantısı kullan"
            : "Parolayla giriş yap"}
        </button>
        <p className="text-ink-2">
          Hesabınız yok mu?{" "}
          <Link href="/kayit" className="text-brand underline underline-offset-2">
            Kurum hesabı oluşturun
          </Link>
        </p>
      </div>
    </div>
  );
}
