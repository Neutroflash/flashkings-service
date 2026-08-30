import forge from "node-forge";

export interface ParsedCertificate {
  certificatePem: string;
  privateKeyPem: string;
  /** DER en base64, sin cabeceras PEM — es lo que va dentro de <ds:X509Certificate>. */
  certificateDerBase64: string;
  /** DER crudo — lo que se hashea para <xades:CertDigest> (XAdES-BES). */
  certificateDer: Buffer;
  /** Emisor en formato "CN=...,O=...,C=..." — best-effort, ver el comentario en xades.ts sobre
   * por qué este campo pesa menos que CertDigest en la validación real. */
  issuerName: string;
  /** Número de serie en decimal (X509SerialNumber de XAdES lo exige así, no en hex). */
  serialNumberDecimal: string;
}

/**
 * Extrae la clave privada y el certificado de un .pfx/.p12 (formato estándar en el que SUNAT y
 * las entidades certificadoras peruanas entregan el certificado digital de un contribuyente).
 * node-forge es la única dependencia que toca el archivo crudo — nunca se persiste ni se loguea
 * el contenido descifrado, solo se mantiene en memoria durante la firma de un comprobante puntual.
 */
export function parsePfx(pfxBuffer: Buffer, password: string): ParsedCertificate {
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfxBuffer.toString("binary")));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag];
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];

  const keyBag = keyBags?.[0];
  const certBag = certBags?.[0];
  if (!keyBag?.key || !certBag?.cert) {
    throw new Error("El archivo .pfx no contiene una clave privada y un certificado válidos, o la contraseña es incorrecta");
  }

  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);
  const certificatePem = forge.pki.certificateToPem(certBag.cert);
  const derBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(certBag.cert)).getBytes();
  const certificateDer = Buffer.from(derBytes, "binary");
  const certificateDerBase64 = forge.util.encode64(derBytes);

  // RFC2253-ish, orden inverso al de forge (que lista del más general al más específico) — best
  // effort: distintos emisores usan atributos distintos y el orden exacto no está 100%
  // estandarizado entre implementaciones. El campo que SUNAT valida criptográficamente de verdad
  // es CertDigest (el hash del certificado), no este texto descriptivo.
  const issuerName = certBag.cert.issuer.attributes
    .slice()
    .reverse()
    .map((attr) => `${attr.shortName ?? attr.name}=${attr.value}`)
    .join(",");

  const serialNumberDecimal = BigInt(`0x${certBag.cert.serialNumber}`).toString(10);

  return { certificatePem, privateKeyPem, certificateDerBase64, certificateDer, issuerName, serialNumberDecimal };
}
