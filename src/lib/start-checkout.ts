export async function startCheckout(): Promise<{ ok: true; url: string } | { ok: false; status: number; error?: string }> {
  const res = await fetch("/api/stripe/checkout", { method: "POST" });
  const data = await res.json();

  if (res.status === 401) {
    return { ok: false, status: 401 };
  }

  if (data.url) {
    return { ok: true, url: data.url };
  }

  return { ok: false, status: res.status, error: data.error };
}
