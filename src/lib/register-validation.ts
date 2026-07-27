/**
 * Pure registration payload validation — kept separate so tests can cover
 * email/password-only signup without spinning up Next route handlers.
 */

export type RegisterInput = {
  email?: unknown;
  password?: unknown;
  name?: unknown;
  phoneNumber?: unknown;
};

export type RegisterValidation =
  | { ok: true; email: string; password: string; name?: string }
  | { ok: false; error: string; status: number };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegisterInput(body: RegisterInput): RegisterValidation {
  if (body.phoneNumber != null && String(body.phoneNumber).trim() !== "") {
    return {
      ok: false,
      status: 400,
      error: "Phone number is not collected at signup. Add it later to enable SMS alerts.",
    };
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const nameRaw = body.name != null ? String(body.name).trim() : "";
  const name = nameRaw ? nameRaw.slice(0, 80) : undefined;

  if (!email || !password) {
    return { ok: false, status: 400, error: "Email and password are required" };
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { ok: false, status: 400, error: "Enter a valid email address" };
  }
  if (password.length < 8 || password.length > 72) {
    return { ok: false, status: 400, error: "Password must be 8–72 characters" };
  }

  return { ok: true, email, password, ...(name ? { name } : {}) };
}
