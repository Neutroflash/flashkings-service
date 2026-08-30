import { readFileSync } from "fs";
import { env } from "../../../config/env";
import type { SunatCredentials } from "./types";

let cached: SunatCredentials | null | undefined;

/**
 * Lee el certificado del disco de forma perezosa (no en el arranque del módulo `env.ts`) — así un
 * despliegue sin `SUNAT_PROVIDER=sunat` nunca intenta leer un archivo que puede no existir.
 * Cacheado tras la primera lectura exitosa: el archivo no cambia en caliente, releerlo en cada
 * comprobante sería trabajo de disco innecesario.
 */
export function resolveSunatCredentials(): SunatCredentials | null {
  if (env.sunat.provider !== "sunat") return null;
  if (cached !== undefined) return cached;

  if (!env.sunat.ruc || !env.sunat.solUser || !env.sunat.solPassword || !env.sunat.certPath || !env.sunat.certPassword) {
    throw new Error(
      "SUNAT_PROVIDER=sunat pero faltan variables: SUNAT_RUC, SUNAT_SOL_USER, SUNAT_SOL_PASSWORD, SUNAT_CERT_PATH, SUNAT_CERT_PASSWORD",
    );
  }

  const pfxBuffer = readFileSync(env.sunat.certPath);
  cached = {
    ruc: env.sunat.ruc,
    solUser: env.sunat.solUser,
    solPassword: env.sunat.solPassword,
    environment: env.sunat.environment,
    certificate: { pfxBuffer, password: env.sunat.certPassword },
  };
  return cached;
}
