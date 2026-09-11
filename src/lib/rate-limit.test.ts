import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: async () => ({}) }) }));

import { RATE_LIMITS } from "@/lib/rate-limit";

describe("RATE_LIMITS", () => {
  it("すべての枠に上限・時間窓・文言がある", () => {
    for (const [name, policy] of Object.entries(RATE_LIMITS)) {
      expect(policy.limit, name).toBeGreaterThan(0);
      expect(policy.windowSeconds, name).toBeGreaterThan(0);
      expect(policy.message.length, name).toBeGreaterThan(0);
    }
  });

  it("認証系はアドレス単位と IP 単位が対になっている", () => {
    const keys = Object.keys(RATE_LIMITS);
    const authKeys = keys.filter((key) => key.startsWith("auth_") && !key.endsWith("_ip"));

    // 対になる IP 単位の枠が無いと assertAuthRateLimit が存在しない枠を引く
    expect(authKeys.length).toBeGreaterThan(0);
    for (const key of authKeys) {
      expect(keys, `${key} に対応する ${key}_ip`).toContain(`${key}_ip`);
    }
  });

  it("IP 単位の上限はアドレス単位より緩い", () => {
    // 同じ回線から複数人が使う場合があるため、IP 側を厳しくしすぎない
    const authKeys = Object.keys(RATE_LIMITS).filter(
      (key) => key.startsWith("auth_") && !key.endsWith("_ip"),
    ) as (keyof typeof RATE_LIMITS)[];

    for (const key of authKeys) {
      const perAddress = RATE_LIMITS[key];
      const perIp = RATE_LIMITS[`${key}_ip` as keyof typeof RATE_LIMITS];
      expect(perIp.limit, `${key}_ip`).toBeGreaterThanOrEqual(perAddress.limit);
    }
  });

  it("認証系の文言はアカウントの存在を漏らさない", () => {
    const authKeys = Object.keys(RATE_LIMITS).filter((key) => key.startsWith("auth_"));
    for (const key of authKeys) {
      const message = RATE_LIMITS[key as keyof typeof RATE_LIMITS].message;
      // 「登録されていません」「パスワードが違います」等を出さない
      expect(message, key).not.toMatch(/登録|存在|パスワードが|アカウントが/);
    }
  });
});
