import { describe, expect, it } from "vitest";
import { orderCreateSchema, roleSelectSchema } from "../validation";

describe("validation", () => {
  it("accepts a valid role", () => {
    expect(roleSelectSchema.parse({ role: "seller" }).role).toBe("seller");
  });
  it("rejects unknown role", () => {
    expect(() => roleSelectSchema.parse({ role: "root" })).toThrow();
  });
  it("rejects order without address city", () => {
    expect(orderCreateSchema.safeParse({
      listingId: "x", paymentMethod: "cod", address: {},
    }).success).toBe(false);
  });
});
