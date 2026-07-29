export async function startCheckout(): Promise<
  | { ok: true; url: string; alreadySubscribed?: boolean }
  | { ok: false; status: number; error?: string }
> {
  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan: "monthly" }),
  });
  const data = await res.json();

  if (res.status === 401) {
    return { ok: false, status: 401 };
  }

  // 409 ALREADY_SUBSCRIBED still returns portal url
  if (data.url) {
    return {
      ok: true,
      url: data.url,
      alreadySubscribed: data.code === "ALREADY_SUBSCRIBED" || res.status === 409,
    };
  }

  return { ok: false, status: res.status, error: data.error };
}
