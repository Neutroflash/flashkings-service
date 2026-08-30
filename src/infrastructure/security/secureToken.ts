import { randomBytes, createHash } from "crypto";

/** Token de un solo uso (reset de contraseña, verificación de email) — se envía por correo tal
 * cual, pero solo se persiste su hash (ver hashSecureToken). 32 bytes aleatorios: suficiente
 * entropía para que adivinarlo no sea viable ni con muchísimos intentos. */
export function generateSecureToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashSecureToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
