import { afterEach, expect, test, vi } from "vitest";
import { formatRelativeTime } from "../date";
afterEach(() => vi.useRealTimers());
test("relative timestamps follow the real clock instead of a preview date", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2027-01-10T12:00:00Z"));
  expect(formatRelativeTime("2027-01-10T11:45:00Z")).toBe("15m ago");
  expect(formatRelativeTime("2027-01-10T10:00:00Z")).toBe("2h ago");
  expect(formatRelativeTime("2027-01-09T12:00:00Z")).toBe("1d ago");
  expect(formatRelativeTime("2027-01-10T12:00:01Z")).toBe("just now");
  expect(formatRelativeTime("invalid")).toBe("Unknown date");
});
