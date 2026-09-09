import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { noStoreFetch } from "./no-store-fetch";

describe("noStoreFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("forces authenticated server reads to bypass shared caches", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await noStoreFetch("https://staging.example.invalid/rest/v1/children", {
      cache: "force-cache",
      headers: { Accept: "application/json" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://staging.example.invalid/rest/v1/children",
      expect.objectContaining({ cache: "no-store", headers: { Accept: "application/json" } }),
    );
  });

  it("returns the latest attendance on the first read after a teacher mutation", async () => {
    let attendance = "expected";
    const fetchMock = vi.fn(async () => Response.json({ status: attendance }));
    vi.stubGlobal("fetch", fetchMock);

    const before = await noStoreFetch("https://staging.example.invalid/rest/v1/attendance_records");
    expect(await before.json()).toEqual({ status: "expected" });

    attendance = "present";

    const after = await noStoreFetch("https://staging.example.invalid/rest/v1/attendance_records");
    expect(await after.json()).toEqual({ status: "present" });
    expect(fetchMock).toHaveBeenNthCalledWith(1, expect.any(String), { cache: "no-store" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.any(String), { cache: "no-store" });
  });
});
