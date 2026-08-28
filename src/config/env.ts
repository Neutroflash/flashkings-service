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
  cookieDomain: process.env.COOKIE_DOMAIN ?? "localhost",
  // Comma-separated allowlist (e.g. "https://flashkings.pe,https://www.flashkings.pe") — never a
  // wildcard, since credentials: true CORS + an open origin would defeat the SameSite cookie protection.
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(",").map((origin) => origin.trim()),
  isProduction: process.env.NODE_ENV === "production",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  stockHoldMinutes: Number(process.env.STOCK_HOLD_MINUTES ?? 15),
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
    culqiWebhookSecret: process.env.CULQI_WEBHOOK_SECRET ?? "",
  },
};
