import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "http";

// El allowlist se lee al importar config/env, así que hay que fijarlo ANTES de cargar la app.
process.env.CORS_ORIGIN = "https://flashkings.pe,https://www.flashkings.pe";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/flashkings_test?schema=public";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret";

const { createApp } = await import("../../src/app");

const PERMITIDO = "https://flashkings.pe";
// La forma exacta que tiene un deployment de preview de Vercel, que es donde apareció el problema.
const AJENO = "https://flashkings-webapp-git-main-neutroflashs-projects.vercel.app";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server.close();
});

describe("política de CORS", () => {
  /**
   * Regresión del diagnóstico de los previews de Vercel: un origen fuera del allowlist devolvía
   * 500 porque el callback de `cors` lanzaba un Error pelado y caía en el catch-all del
   * errorHandler. El rechazo era correcto; el código de estado mentía, y mandaba a buscar un bug
   * de servidor donde había un problema de configuración.
   */
  test("un origen no permitido recibe 403, no 500", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, { headers: { Origin: AJENO } });

    expect(res.status).toBe(403);
    expect(res.status).not.toBe(500);
    expect((await res.json()).error).toMatch(/CORS/);
  });

  test("el preflight de un origen no permitido también dice 403", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: AJENO,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });

    expect(res.status).toBe(403);
  });

  /** Lo que de verdad protege es la ausencia del header, no el status: sigue sin estar. */
  test("un origen no permitido nunca recibe Access-Control-Allow-Origin", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, { headers: { Origin: AJENO } });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("un origen del allowlist sí pasa, con credenciales habilitadas", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, { headers: { Origin: PERMITIDO } });

    // 401 porque no hay cookie de sesión — lo importante es que llegó al handler.
    expect(res.status).toBe(401);
    expect(res.headers.get("access-control-allow-origin")).toBe(PERMITIDO);
    // credentials:true es lo que permite que viajen las cookies HttpOnly de sesión.
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("el preflight de un origen permitido responde 2xx", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: PERMITIDO,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });

    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("access-control-allow-origin")).toBe(PERMITIDO);
  });

  /**
   * Sin cabecera Origin no hay nada que autorizar: es curl, un health check o una llamada
   * server-to-server. El navegador siempre la manda cuando CORS aplica.
   */
  test("sin Origin la petición pasa como siempre", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    expect(res.status).toBe(401);
  });

  test("el allowlist distingue subdominios: www sí, otro no", async () => {
    const www = await fetch(`${baseUrl}/api/auth/me`, { headers: { Origin: "https://www.flashkings.pe" } });
    expect(www.status).toBe(401);

    const impostor = await fetch(`${baseUrl}/api/auth/me`, { headers: { Origin: "https://flashkings.pe.evil.com" } });
    expect(impostor.status).toBe(403);
  });
});
