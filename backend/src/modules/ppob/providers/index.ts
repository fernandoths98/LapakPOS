import { env } from "../../../config/env";
import { MockPpobProvider } from "./MockPpobProvider";
import { DigiflazzProvider } from "./DigiflazzProvider";
import { PpobProvider } from "./PpobProvider";

/**
 * Config-switched factory (`PPOB_PROVIDER` env var, "mock" for now) so a real
 * aggregator (Digiflazz, etc) can be added as a second `PpobProvider`
 * implementation and switched to purely by env var — no caller changes.
 */
export function getPpobProvider(): PpobProvider {
  switch (env.PPOB_PROVIDER) {
    case "mock":
      return new MockPpobProvider();
    case "digiflazz":
      return new DigiflazzProvider();
    default:
      throw new Error(`Unsupported PPOB provider: ${env.PPOB_PROVIDER}`);
  }
}

export type { CheckBillInput, CheckBillResult, PayBillInput, PayBillResult, PpobProvider } from "./PpobProvider";
