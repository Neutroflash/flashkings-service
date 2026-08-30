import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET"),
    refreshSecret: required("JWT_REFRESH_SECRET"),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
  },
  // Unset by default (host-only cookie) — only set COOKIE_DOMAIN once the API and frontend
  // share a real registrable domain as subdomains (e.g. api.flashkings.pe / flashkings.pe).
  // Without one (Render's *.onrender.com + Vercel's *.vercel.app, unrelated domains), setting
  // this to either side's domain makes the browser reject the Set-Cookie outright.
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  // Comma-separated allowlist (e.g. "https://flashkings.pe,https://www.flashkings.pe") — never a
  // wildcard, since credentials: true CORS + an open origin would defeat the SameSite cookie protection.
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(",").map((origin) => origin.trim()),
  isProduction: process.env.NODE_ENV === "production",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  stockHoldMinutes: Number(process.env.STOCK_HOLD_MINUTES ?? 15),
  // For free-tier deploys with no separate always-on worker service — runs the stock-hold
  // expiry worker inside this same process instead. See the comment in server.ts for the tradeoff.
  runWorkerInProcess: process.env.RUN_WORKER_IN_PROCESS === "true",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
  email: {
    provider: (process.env.EMAIL_PROVIDER ?? "console") as "console" | "resend",
    resendApiKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.EMAIL_FROM ?? "Flashkings <pedidos@flashkings.pe>",
  },
  whatsappBusinessPhone: process.env.WHATSAPP_BUSINESS_PHONE ?? "",
  payment: {
    gateway: (process.env.PAYMENT_GATEWAY ?? "fake") as "fake" | "culqi",
    culqiPublicKey: process.env.CULQI_PUBLIC_KEY ?? "",
    culqiSecretKey: process.env.CULQI_SECRET_KEY ?? "",
  },
  // Integración directa con SUNAT (sin PSE/OSE) — single-tenant, así que las credenciales viven
  // en variables de entorno, no cifradas en la base de datos (a diferencia de saas-erp-pe, de
  // donde se portó este módulo: ahí cada tenant tiene sus propias credenciales, acá solo hay un
  // negocio). El certificado se lee de un archivo en disco (SUNAT_CERT_PATH), no de una env var
  // en base64 — más simple de montar como secret file en el hosting (Render lo soporta nativo).
  sunat: {
    provider: (process.env.SUNAT_PROVIDER ?? "fake") as "fake" | "sunat",
    environment: (process.env.SUNAT_ENVIRONMENT ?? "BETA") as "BETA" | "PRODUCCION",
    ruc: process.env.SUNAT_RUC ?? "",
    businessName: process.env.SUNAT_BUSINESS_NAME ?? "",
    address: process.env.SUNAT_ADDRESS ?? "",
    solUser: process.env.SUNAT_SOL_USER ?? "",
    solPassword: process.env.SUNAT_SOL_PASSWORD ?? "",
    certPath: process.env.SUNAT_CERT_PATH ?? "",
    certPassword: process.env.SUNAT_CERT_PASSWORD ?? "",
  },
};
