import { afterEach, expect, test, vi } from "vitest";
import { getNativeNotesApiUrl, getSignInUrl } from "@/lib/config";
import nextConfig from "../../../next.config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
test("production browser always uses same origin despite a stale public backend env", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv(
    "NEXT_PUBLIC_NATIVE_NOTES_API_URL",
    "https://nativenotes.vercel.app",
  );
  vi.stubGlobal("window", { location: { origin: "https://nativenotes.app" } });
  expect(getNativeNotesApiUrl()).toBe("https://nativenotes.app");
  expect(getSignInUrl()).toBe(
    "https://nativenotes.app/sign-in?callbackURL=https%3A%2F%2Fnativenotes.app%2Fapp",
  );
});
test("local development keeps dual ports", () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_NATIVE_NOTES_API_URL", "http://localhost:3000");
  vi.stubGlobal("window", undefined);
  expect(getNativeNotesApiUrl()).toBe("http://localhost:3000");
  expect(getSignInUrl()).toContain(
    "callbackURL=http%3A%2F%2Flocalhost%3A3001%2Fapp",
  );
});
test("Vercel builds fail closed without backend origin", async () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("NATIVE_NOTES_BACKEND_ORIGIN", "");
  await expect(nextConfig.rewrites!()).rejects.toMatchObject({
    message: expect.stringMatching(/required/),
  });
});
test("Next config rejects its own deployment URL and preserves the explicit map", async () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_URL", "web-preview.vercel.app");
  vi.stubEnv("NATIVE_NOTES_BACKEND_ORIGIN", "https://web-preview.vercel.app");
  await expect(nextConfig.rewrites!()).rejects.toMatchObject({
    message: expect.stringMatching(/rewrite loop/),
  });
  vi.stubEnv("NATIVE_NOTES_BACKEND_ORIGIN", "https://nativenotes.vercel.app");
  expect(await nextConfig.rewrites!()).toHaveLength(10);
});
