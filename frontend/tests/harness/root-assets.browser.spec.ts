import { expect, test } from "@playwright/test";

test("existing public root logos are served at their referenced URLs", async ({ request }) => {
  for (const asset of ["/next.svg", "/vercel.svg"]) {
    const response = await request.get(asset);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/svg+xml");
    expect(await response.text()).toContain("<svg");
  }
});
