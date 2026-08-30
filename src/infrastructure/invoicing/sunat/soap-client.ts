import archiver from "archiver";
import AdmZip from "adm-zip";
import { DOMParser } from "@xmldom/xmldom";
import type { Document as XmlDocument } from "@xmldom/xmldom";
import type { SunatCredentials, SunatSendResult } from "./types";

export const SUNAT_ENDPOINTS = {
  BETA: "https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService",
  PRODUCCION: "https://e-factura.sunat.gob.pe/ol-ti-itcpe/billService",
} as const;

// Exportado: también lo usa gre-client.ts (guías de remisión) — mismo empaquetado ZIP que exige
// SUNAT tanto en el envío SOAP de comprobantes como en el REST de la API GRE.
export async function zipXml(fileName: string, xmlContent: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("error", reject);
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.append(xmlContent, { name: fileName });
    void archive.finalize();
  });
}

function buildSoapEnvelope(params: { solUsername: string; solPassword: string; fileName: string; zipBase64: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:ser="http://service.sunat.gob.pe">
  <soap-env:Header>
    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${params.solUsername}</wsse:Username>
        <wsse:Password>${params.solPassword}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap-env:Header>
  <soap-env:Body>
    <ser:sendBill>
      <fileName>${params.fileName}</fileName>
      <contentFile>${params.zipBase64}</contentFile>
    </ser:sendBill>
  </soap-env:Body>
</soap-env:Envelope>`;
}

function textOf(doc: XmlDocument, localName: string): string | undefined {
  const nodes = doc.getElementsByTagName("*");
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes.item(i);
    if (node && node.localName === localName) {
      return node.textContent?.trim();
    }
  }
  return undefined;
}

/** El CDR es un UBL ApplicationResponse — solo nos interesan dos campos para decidir ISSUED/FAILED. */
function parseCdr(cdrXml: string): { responseCode?: string; description?: string } {
  const doc = new DOMParser().parseFromString(cdrXml, "text/xml");
  return { responseCode: textOf(doc, "ResponseCode"), description: textOf(doc, "Description") };
}

/**
 * Envía el XML firmado al Web Service SOAP de SUNAT (`sendBill`) y devuelve un resultado que
 * distingue explícitamente "SUNAT rechazó el comprobante" (`transient: false`, hay que corregir
 * el documento) de "SUNAT no respondió" (`transient: true`, reintentar más tarde no requiere
 * ningún cambio — ver domain/invoicing/sunat/gateway.ts y lib/sunat-retry-queue.ts).
 *
 * ⚠️ No probado contra el endpoint beta real — ver el comentario en sign.ts. El WS-Security
 * `UsernameToken` con usuario `{RUC}{usuarioSOL}` y password en texto plano dentro de un POST
 * HTTPS es el mecanismo de autenticación documentado por SUNAT (no es una elección débil nuestra:
 * es lo que su Web Service exige).
 */
export async function sendToSunat(signedXml: string, credentials: SunatCredentials, fileName: string): Promise<SunatSendResult> {
  const zipBuffer = await zipXml(`${fileName}.xml`, signedXml);
  const envelope = buildSoapEnvelope({
    solUsername: `${credentials.ruc}${credentials.solUser}`,
    solPassword: credentials.solPassword,
    fileName: `${fileName}.zip`,
    zipBase64: zipBuffer.toString("base64"),
  });

  const endpoint = SUNAT_ENDPOINTS[credentials.environment];

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/xml;charset=UTF-8", SOAPAction: "urn:sendBill" },
      body: envelope,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    // Sin respuesta de red (SUNAT caído, timeout, DNS) — nunca es un rechazo del comprobante.
    return { accepted: false, transient: true, description: "No se pudo conectar con SUNAT" };
  }

  const bodyText = await res.text();

  if (!res.ok) {
    // 5xx/errores de infraestructura de SUNAT — reintentar más tarde, el documento no cambió.
    if (res.status >= 500) {
      return { accepted: false, transient: true, description: `SUNAT respondió ${res.status}` };
    }
    return { accepted: false, transient: false, description: `SUNAT rechazó la solicitud (HTTP ${res.status})`, responseCode: String(res.status) };
  }

  if (bodyText.includes("soap-env:Fault") || bodyText.includes("soapenv:Fault") || bodyText.includes("<faultcode>")) {
    const faultDoc = new DOMParser().parseFromString(bodyText, "text/xml");
    const faultString = textOf(faultDoc, "faultstring") ?? "SUNAT rechazó el comprobante";
    return { accepted: false, transient: false, description: faultString };
  }

  const applicationResponseMatch = bodyText.match(/<applicationResponse>([^<]+)<\/applicationResponse>/);
  if (!applicationResponseMatch) {
    return { accepted: false, transient: true, description: "Respuesta de SUNAT en un formato inesperado" };
  }

  const cdrZipBuffer = Buffer.from(applicationResponseMatch[1], "base64");
  const zip = new AdmZip(cdrZipBuffer);
  const cdrEntry = zip.getEntries().find((e) => e.entryName.toUpperCase().endsWith(".XML"));
  if (!cdrEntry) {
    return { accepted: false, transient: true, description: "CDR de SUNAT sin XML dentro del ZIP" };
  }

  const { responseCode, description } = parseCdr(cdrEntry.getData().toString("utf8"));
  // Código "0" = aceptado. Cualquier otro código catalogado por SUNAT es un rechazo real del
  // comprobante (RUC no habido, dato inconsistente, etc.) — no reintentable sin corregirlo.
  const accepted = responseCode === "0";
  return { accepted, transient: false, responseCode, description, cdrZip: cdrZipBuffer };
}
