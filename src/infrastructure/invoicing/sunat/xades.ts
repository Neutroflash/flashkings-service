import { createHash } from "crypto";
import { DOMParser } from "@xmldom/xmldom";
import { ExclusiveCanonicalization } from "xml-crypto";
import type { ParsedCertificate } from "./certificate";

const XADES_NS = "http://uri.etsi.org/01903/v1.3.2#";
const DS_NS = "http://www.w3.org/2000/09/xmldsig#";
export const SIGNED_PROPERTIES_ID = "SunatSignedProperties";
export const SIGNATURE_ID = "SunatSignature";

const canonicalizer = new ExclusiveCanonicalization();

/** exc-c14n de un Element (puede ser standalone o parte de un DOM más grande — ver el comentario
 * en sign.ts sobre por qué SignedInfo se canonicaliza dentro de su árbol real, no standalone). */
export function canonicalizeElement(element: Element): string {
  return canonicalizer.process(element, {});
}

/** Digest de una cadena XML ya canonicalizada (exc-c14n produce UTF-8 por definición). */
export function digestBase64FromCanonicalXml(canonicalXml: string): string {
  return createHash("sha256").update(canonicalXml, "utf8").digest("base64");
}

/** Digest de bytes crudos (el DER del certificado para `xades:CertDigest` — nunca pasa por c14n,
 * no es XML). Separado de `digestBase64FromCanonicalXml` a propósito: mezclar ambos caminos fue
 * el bug real que se encontró y corrigió al escribir este archivo — un Buffer binario reinterpretado
 * como texto UTF-8 corrompe cualquier byte fuera del rango ASCII. */
export function digestBase64FromBuffer(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("base64");
}

/**
 * Perú no observa horario de verano — UTC-5 siempre. Se fija explícitamente en vez de usar el
 * offset del servidor porque un despliegue en un servidor con reloj en UTC (lo más común) daría
 * un `xades:SigningTime` correcto en instante pero con el offset equivocado si se dejara que
 * `Date` lo infiriera de la zona horaria del proceso.
 */
function signingTimeIso(date: Date): string {
  const shifted = new Date(date.getTime() - 5 * 60 * 60 * 1000);
  return `${shifted.toISOString().slice(0, 19)}-05:00`;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * `xades:SignedProperties` — el bloque que convierte una firma XMLDSig simple en XAdES-BES.
 * Namespaces declarados EN el propio nodo raíz (no heredados de un ancestro) a propósito: así el
 * fragmento es autocontenido y su forma canónica no depende de dónde termine anidado en el
 * documento final (ver el comentario grande sobre esto en sign.ts).
 *
 * `CertDigest` es el campo que SUNAT valida criptográficamente contra el certificado recibido en
 * `KeyInfo` — es la pieza que realmente ata la firma a ESE certificado. `IssuerSerial`
 * (X509IssuerName/X509SerialNumber) es descriptivo/best-effort, ver el comentario en
 * certificate.ts.
 */
export function buildSignedPropertiesElement(cert: ParsedCertificate, signingTime: Date): Element {
  const certDigest = digestBase64FromBuffer(cert.certificateDer);

  const xml = `<xades:SignedProperties xmlns:xades="${XADES_NS}" xmlns:ds="${DS_NS}" Id="${SIGNED_PROPERTIES_ID}">
  <xades:SignedSignatureProperties>
    <xades:SigningTime>${signingTimeIso(signingTime)}</xades:SigningTime>
    <xades:SigningCertificate>
      <xades:Cert>
        <xades:CertDigest>
          <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
          <ds:DigestValue>${certDigest}</ds:DigestValue>
        </xades:CertDigest>
        <xades:IssuerSerial>
          <ds:X509IssuerName>${escapeXml(cert.issuerName)}</ds:X509IssuerName>
          <ds:X509SerialNumber>${cert.serialNumberDecimal}</ds:X509SerialNumber>
        </xades:IssuerSerial>
      </xades:Cert>
    </xades:SigningCertificate>
  </xades:SignedSignatureProperties>
</xades:SignedProperties>`;

  return parseXmlElement(xml);
}

export function parseXmlElement(xml: string): Element {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  return doc.documentElement as unknown as Element;
}
