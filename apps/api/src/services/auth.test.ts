import { describe, expect, it } from "vitest";
import { hashPassword, issueToken, readToken, verifyPassword } from "./auth";

describe("contraseñas", () => {
  it("verifica la correcta y rechaza la errada", async () => {
    const h = await hashPassword("clave-segura");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("clave-segura", h)).toBe(true);
    expect(await verifyPassword("otra", h)).toBe(false);
  });
});

describe("tokens", () => {
  it("lee un token válido", () => {
    expect(readToken(issueToken("u1"))).toBe("u1");
  });
  it("rechaza un token alterado", () => {
    const t = issueToken("u1");
    const [p, s] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "admin", exp: 9e9 })).toString("base64url");
    expect(readToken(`${forged}.${s}`)).toBeNull();
    expect(readToken(`${p}.x${s}`)).toBeNull();
  });
  it("rechaza un token vencido", () => {
    const t = issueToken("u1", Date.now() - 31 * 86_400_000);
    expect(readToken(t)).toBeNull();
  });
});
