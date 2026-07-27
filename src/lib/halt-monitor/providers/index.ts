import { createOfficialExchangeProvider } from "./official.ts";
import { createLicensedLuldProvider } from "./licensed.ts";
import type { HaltProvider } from "../types.ts";

export { createOfficialExchangeProvider } from "./official.ts";
export {
  createLicensedLuldProvider,
  createFixtureProvider,
} from "./licensed.ts";

export function defaultHaltProviders(): HaltProvider[] {
  return [createOfficialExchangeProvider(), createLicensedLuldProvider()];
}
