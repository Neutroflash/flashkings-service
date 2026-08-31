import { DOMParser } from "@xmldom/xmldom";

/**
 * Extrae el "Valor Resumen" que exige SUNAT en el QR del comprobante (Anexo N°7 — confirmado
 * contra la normativa oficial: es el <ds:DigestValue> de la Referencia 1, el documento completo
 * con URI="", en base64 — no el de SignedProperties, que es la segunda referencia). Portado de
 * saas-erp-pe, donde se encontró que buildQrContent() nunca había incluido este campo. Se
 * re-parsea del XML ya firmado en vez de devolverlo desde `signSunatXML()` en el momento de
 * firmar, para no acoplar la firma (le importa a SUNAT) con la representación impresa (le importa
 * al cliente): cualquier llamador con el `signedXml` ya persistido puede pedirlo sin volver a
 * firmar nada.
 */
export function extractDocumentDigestValue(signedXml: string): string {
  const doc = new DOMParser().parseFromString(signedXml, "text/xml");
  const references = doc.getElementsByTagName("ds:Reference");
  for (let i = 0; i < references.length; i++) {
    const ref = references.item(i);
    if (ref && ref.getAttribute("URI") === "") {
      const digest = ref.getElementsByTagName("ds:DigestValue").item(0)?.textContent;
      if (digest) return digest.trim();
    }
  }
  throw new Error("No se pudo extraer el Valor Resumen (DigestValue) del XML firmado");
}
