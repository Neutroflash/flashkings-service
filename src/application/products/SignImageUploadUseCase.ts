import { createHash } from "crypto";
import { env } from "../../config/env";
import { ConflictError } from "../../shared/errors/AppError";

export interface SignedUpload {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
}

/**
 * ADMIN-only. Firma un upload para que el navegador suba la imagen DIRECTO a Cloudinary.
 *
 * El archivo nunca pasa por nuestro servidor, y eso es deliberado: el plan Starter de Render son
 * 512 MB de RAM, y hacer de intermediario de subidas de imágenes es la forma más rápida de
 * tumbarlo. El `api_secret` tampoco viaja al navegador — se usa solo acá para calcular la firma.
 *
 * El esquema es el que documenta Cloudinary: SHA-1 de los parámetros a firmar ordenados
 * alfabéticamente, concatenados como query string, con el api_secret pegado al final.
 */
export class SignImageUploadUseCase {
  execute(): SignedUpload {
    const { cloudName, apiKey, apiSecret, uploadFolder } = env.cloudinary;
    if (!cloudName || !apiKey || !apiSecret) {
      throw new ConflictError(
        "Subida de imágenes no configurada: faltan CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET",
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);
    // Solo estos dos parámetros se firman, así que son los únicos que el navegador puede mandar
    // además del archivo: cualquier otro invalidaría la firma. En particular, el `folder` queda
    // fijado acá y no lo elige el cliente.
    const toSign = `folder=${uploadFolder}&timestamp=${timestamp}`;
    const signature = createHash("sha1").update(`${toSign}${apiSecret}`).digest("hex");

    return { cloudName, apiKey, timestamp, folder: uploadFolder, signature };
  }
}
