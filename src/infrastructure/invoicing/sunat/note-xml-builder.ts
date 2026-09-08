import { montoEnLetras } from "./amount-to-words";
import {
  buildCustomerPartyBlock,
  buildLineTaxTotalBlock,
  buildSignatureBlock,
  buildSupplierPartyBlock,
  buildTaxTotalBlock,
  cdata,
  computeLineBreakdowns,
  formatAmount,
  formatDate,
  sumTotals,
  UBL_EXTENSIONS_PLACEHOLDER,
} from "./xml-common";
import type { SunatNotePayload } from "./types";

/**
 * `cac:DiscrepancyResponse` + `cac:BillingReference` — el par de bloques que hace que este
 * documento sea una CORRECCIÓN de un comprobante específico y no un comprobante suelto. Sin
 * ellos SUNAT rechaza la nota, aunque el resto del XML sea idéntico a una boleta válida.
 */
function buildDiscrepancyAndReferenceBlocks(payload: SunatNotePayload): string {
  const related = payload.documentoRelacionado;
  return `<cac:DiscrepancyResponse>
    <cbc:ReferenceID>${related.serie}-${related.numero}</cbc:ReferenceID>
    <cbc:ResponseCode>${payload.motivoCodigo}</cbc:ResponseCode>
    <cbc:Description>${cdata(payload.motivoDescripcion)}</cbc:Description>
  </cac:DiscrepancyResponse>
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${related.serie}-${related.numero}</cbc:ID>
      <cbc:DocumentTypeCode>${related.tipoDocumento}</cbc:DocumentTypeCode>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>`;
}

/**
 * UBL 2.1 CreditNote — Anexo N°55 de SUNAT. Misma estructura que generateInvoiceXML (mismos
 * bloques de emisor, cliente, impuestos y firma, mismos helpers de xml-common), más el par
 * DiscrepancyResponse/BillingReference de arriba. Las diferencias estructurales reales frente a
 * una Invoice son tres, y las tres las impone el schema UBL para este tipo de documento, no una
 * elección nuestra:
 *
 *   1. Raíz `<CreditNote>` con su propio namespace, y líneas `cac:CreditNoteLine`.
 *   2. `cbc:CreditedQuantity` en vez de `cbc:InvoicedQuantity`.
 *   3. No lleva `cbc:InvoiceTypeCode` — el tipo (07) viaja en el nombre del archivo ZIP que
 *      recibe SUNAT, no dentro del XML.
 *
 * Portado de saas-erp-pe, donde está ✅ confirmado en vivo contra `e-beta.sunat.gob.pe`
 * ("La Nota de Credito numero BC01-1, ha sido aceptada"). Acá está adaptado a los helpers de este
 * proyecto — que asumen todo gravado y cantidades enteras, sin el manejo de exonerados/inafectos
 * ni unidades fraccionarias del proyecto de origen — y queda pendiente de confirmar contra BETA
 * con las credenciales de este negocio.
 *
 * El `encoding="UTF-8"` del prólogo no es cosmético: en el proyecto de origen, declarar
 * ISO-8859-1 mientras se enviaban bytes UTF-8 hacía que SUNAT decodificara distinto a como se
 * canonicalizaba localmente, y el digest de la firma no coincidía (Client.2335, "Incorrect
 * reference digest value"). Solo se dispara con texto acentuado — y los motivos del catálogo 09
 * ("Anulación de la operación") lo tienen siempre.
 */
export function generateCreditNoteXML(payload: SunatNotePayload): string {
  const { emisor, cliente, lineas, serie, numero, fechaEmision } = payload;
  const lineBreakdowns = computeLineBreakdowns(lineas);
  const totals = sumTotals(lineBreakdowns);

  const noteLines = lineBreakdowns
    .map(
      (line, i) => `
  <cac:CreditNoteLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:CreditedQuantity unitCode="NIU">${line.quantity}</cbc:CreditedQuantity>
    <cbc:LineExtensionAmount currencyID="PEN">${formatAmount(line.taxedAmount)}</cbc:LineExtensionAmount>
    <cac:PricingReference>
      <cac:AlternativeConditionPrice>
        <cbc:PriceAmount currencyID="PEN">${formatAmount(line.unitPriceWithTax)}</cbc:PriceAmount>
        <cbc:PriceTypeCode>01</cbc:PriceTypeCode>
      </cac:AlternativeConditionPrice>
    </cac:PricingReference>
    ${buildLineTaxTotalBlock(line)}
    <cac:Item>
      <cbc:Description>${cdata(line.description)}</cbc:Description>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="PEN">${formatAmount(line.unitValue)}</cbc:PriceAmount>
    </cac:Price>
  </cac:CreditNoteLine>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:qdt="urn:oasis:names:specification:ubl:schema:xsd:QualifiedDatatypes-2" xmlns:udt="urn:un:unece:uncefact:data:specification:UnqualifiedDataTypesSchemaModule:2" xmlns:sac="urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1">
  ${UBL_EXTENSIONS_PLACEHOLDER}
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${serie}-${numero}</cbc:ID>
  <cbc:IssueDate>${formatDate(fechaEmision)}</cbc:IssueDate>
  <cbc:Note languageLocaleID="1000">${cdata(montoEnLetras(totals.totalVenta))}</cbc:Note>
  <cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode>
  ${buildDiscrepancyAndReferenceBlocks(payload)}
  ${buildSignatureBlock(emisor.ruc, emisor.businessName)}
  ${buildSupplierPartyBlock(emisor)}
  ${buildCustomerPartyBlock(cliente)}
  ${buildTaxTotalBlock(totals)}
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="PEN">${formatAmount(totals.totalGravada)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="PEN">${formatAmount(totals.totalVenta)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="PEN">${formatAmount(totals.totalVenta)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${noteLines}
</CreditNote>`;
}
