import { createSign } from "crypto";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { parsePfx } from "./certificate";
import {
  buildSignedPropertiesElement,
  canonicalizeElement,
  digestBase64FromCanonicalXml,
  SIGNATURE_ID,
  SIGNED_PROPERTIES_ID,
} from "./xades";

const serializer = new XMLSerializer();

/**
 * Firma **XAdES-BES** (no XMLDSig plano) insertada dentro de
 * `ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent` — agnóstica del tipo de documento UBL
 * (Invoice/CreditNote/DebitNote comparten esa misma estructura de extensión), sirve para firmar
 * boletas/facturas (xml-builder.ts) y notas de crédito/débito (note-xml-builder.ts) por igual.
 *
 * Se construye a mano en dos referencias (no con el `addReference()` de alto nivel de xml-crypto)
 * porque esa API no expone un hook para agregar una segunda `Reference` con contenido
 * pre-calculado (`SignedProperties`) antes de `computeSignature()` — es justo lo que hace falta
 * para XAdES-BES. Sí se reutiliza el canonicalizador exclusivo `ExclusiveCanonicalization` que
 * xml-crypto expone públicamente (xades.ts): la canonicalización es la parte más fácil de
 * arruinar a mano, no tenía sentido reimplementarla habiendo una ya probada.
 *
 * **Orden de construcción, y por qué importa:**
 * 1. Referencia 1 (documento completo, `URI=""`, transform enveloped-signature + exc-c14n): se
 *    digiere el XML SIN firma insertada todavía. Esto es equivalente a digerirlo CON la firma ya
 *    insertada y luego aplicar el transform enveloped-signature (que por definición remueve
 *    cualquier `ds:Signature` descendiente antes de canonicalizar) — computarlo antes evita el
 *    problema de huevo-y-gallina de necesitar la firma para poder calcular su propio digest.
 * 2. Referencia 2 (`SignedProperties`, autocontenida con sus propios namespaces): se digiere
 *    standalone, sin depender de dónde termine anidada.
 * 3. `SignedInfo` (que contiene ambas referencias) se ensambla como parte de un DOM real dentro
 *    de un `<ds:Signature>` completo (con `SignatureValue` todavía vacío) — y se canonicaliza
 *    DESDE ESE ÁRBOL, no como string standalone, porque `xmlns:ds` está declarado en el
 *    `Signature` padre, no en `SignedInfo` mismo; la canonicalización exclusiva necesita el
 *    contexto de ancestros real para renderizar ese namespace heredado correctamente.
 * 4. Recién ahí se firma el `SignedInfo` canonicalizado, y el `SignatureValue` real se sustituye
 *    en el string antes de insertar todo el bloque en el XML original.
 *
 * ✅ **Confirmado contra `e-beta.sunat.gob.pe` real**: la versión anterior (XMLDSig plano) fue
 * rechazada específicamente por el formato de la firma (`faultcode Client.2335`, "Unsupported or
 * unrecognized Signature signer format"). Con XAdES-BES (este archivo) y las mismas credenciales
 * de homologación públicas de SUNAT (RUC 20000000001/MODDATOS) más un certificado **autofirmado**
 * de prueba (no uno de una entidad certificadora acreditada), SUNAT respondió `ResponseCode "0"` —
 * *"La Boleta numero B001-1, ha sido aceptada"*. XAdES-BES era, en efecto, lo que faltaba; el
 * ambiente de homologación de SUNAT valida el formato del documento sin exigir una cadena de
 * confianza real del certificado. Lo único que sigue sin confirmarse es el comportamiento con un
 * certificado real de una entidad certificadora acreditada peruana (necesario para producción) —
 * eso es una validación de confianza de certificado, no de formato del documento, y no hay forma
 * de probarlo sin uno real.
 */
export function signSunatXML(unsignedXml: string, pfxBuffer: Buffer, pfxPassword: string): string {
  const cert = parsePfx(pfxBuffer, pfxPassword);
  const signingTime = new Date();

  // Referencia 1: documento completo, ANTES de insertar la firma (ver el punto 1 del comentario).
  const unsignedDoc = new DOMParser().parseFromString(unsignedXml, "text/xml");
  const documentDigest = digestBase64FromCanonicalXml(canonicalizeElement(unsignedDoc.documentElement as unknown as Element));

  // Referencia 2: SignedProperties, autocontenida.
  const signedPropertiesElement = buildSignedPropertiesElement(cert, signingTime);
  const signedPropertiesDigest = digestBase64FromCanonicalXml(canonicalizeElement(signedPropertiesElement));
  const signedPropertiesXml = serializer.serializeToString(signedPropertiesElement as never);

  const signedInfoAndRest = (signatureValuePlaceholder: string) => `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${SIGNATURE_ID}">
  <ds:SignedInfo>
    <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
    <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
    <ds:Reference URI="">
      <ds:Transforms>
        <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
        <ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
      </ds:Transforms>
      <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
      <ds:DigestValue>${documentDigest}</ds:DigestValue>
    </ds:Reference>
    <ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${SIGNED_PROPERTIES_ID}">
      <ds:Transforms>
        <ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
      </ds:Transforms>
      <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
      <ds:DigestValue>${signedPropertiesDigest}</ds:DigestValue>
    </ds:Reference>
  </ds:SignedInfo>
  <ds:SignatureValue>${signatureValuePlaceholder}</ds:SignatureValue>
  <ds:KeyInfo>
    <ds:X509Data>
      <ds:X509Certificate>${cert.certificateDerBase64}</ds:X509Certificate>
    </ds:X509Data>
  </ds:KeyInfo>
  <ds:Object>
    <xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="#${SIGNATURE_ID}">
      ${signedPropertiesXml}
    </xades:QualifyingProperties>
  </ds:Object>
</ds:Signature>`;

  // Paso 3 del comentario grande: se parsea el bloque completo (con SignatureValue vacío) para
  // que SignedInfo tenga contexto de ancestros real (xmlns:ds heredado de Signature) antes de
  // canonicalizarlo.
  const draftSignatureXml = signedInfoAndRest("");
  const draftDoc = new DOMParser().parseFromString(draftSignatureXml, "text/xml");
  const signedInfoElement = draftDoc.getElementsByTagName("ds:SignedInfo")[0] as unknown as Element;
  const canonicalSignedInfo = canonicalizeElement(signedInfoElement);

  const signatureValue = createSign("RSA-SHA256").update(canonicalSignedInfo, "utf8").sign(cert.privateKeyPem, "base64");

  const finalSignatureXml = signedInfoAndRest(signatureValue);

  return unsignedXml.replace("<ext:ExtensionContent></ext:ExtensionContent>", `<ext:ExtensionContent>${finalSignatureXml}</ext:ExtensionContent>`);
}
