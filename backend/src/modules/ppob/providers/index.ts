import { env } from "../../../config/env";
import { MockPpobProvider } from "./MockPpobProvider";
import { PpobProvider } from "./PpobProvider";

/**
 * Config-switched factory (`PPOB_PROVIDER` env var, "mock" for now) so a real
 * aggregator (Digiflazz, etc) can be added as a second `PpobProvider`
 * implementation and switched to purely by env var — no caller changes.
 */
export function getPpobProvider(): PpobProvider {
  switch (env.PPOB_PROVIDER) {
    case "mock":
    default:
      return new MockPpobProvider();
  }
}

export type { CheckBillInput, CheckBillResult, PayBillInput, PayBillResult, PpobProvider } from "./PpobProvider";
