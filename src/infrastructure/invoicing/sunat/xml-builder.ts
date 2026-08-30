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
import type { SunatInvoicePayload } from "./types";

/**
 * UBL 2.1 Invoice para Boleta (03) / Factura (01) — estructura documentada en el Anexo N°55 de
 * SUNAT (Estructuras y condiciones de uso del sistema de emisión electrónica), portada de
 * saas-erp-pe (mismo módulo `infrastructure/invoicing/sunat/*`, confirmado ahí en vivo contra
 * `e-beta.sunat.gob.pe` real). El nodo de firma se deja como un `<ext:ExtensionContent>` vacío a
 * propósito: `sign.ts` lo completa después, insertando el `<ds:Signature>` ahí adentro — separar
 * generación de firma es lo que permite reintentar un envío (PENDING_SUNAT) sin volver a construir
 * el XML desde cero.
 *
 * ✅ **BOLETA y FACTURA confirmadas en vivo contra `e-beta.sunat.gob.pe` real en ESTE proyecto**
 * (`ResponseCode "0"` en ambas). FACTURA reveló dos bugs reales que BOLETA no disparaba (la
 * validación de SUNAT es más estricta para Factura que para Boleta en este ambiente):
 * 1. Faltaba `cbc:AddressTypeCode` (código de establecimiento/local anexo) en
 *    `AccountingSupplierParty` — rechazo "INFO: 3030 ... no existe información del código de
 *    local anexo del emisor". Fix en `buildSupplierPartyBlock` (xml-common.ts): ahora siempre
 *    incluye `<cbc:AddressTypeCode>0000</cbc:AddressTypeCode>` (domicilio fiscal, el default
 *    cuando el negocio no tiene sucursales/anexos registrados aparte).
 * 2. Faltaba `cac:PaymentTerms` (forma de pago) — rechazo "INFO: 3244 ... Debe consignar la
 *    informacion del tipo de transaccion del comprobante". Fix: se agregó un bloque fijo
 *    `FormaPago=Contado` (coherente con este proyecto — el pago ya se procesó, vía Culqi o
 *    confirmación manual, antes de poder emitir el comprobante, nunca hay venta a crédito).
 * Este mismo par de bugs existe en el módulo original de saas-erp-pe (de donde se portó este
 * archivo) — ahí solo se había confirmado Boleta en vivo, nunca Factura con un comprador RUC real.
 */
export function generateInvoiceXML(payload: SunatInvoicePayload): string {
  const { emisor, cliente, lineas, tipoDocumento, serie, numero, fechaEmision } = payload;

  const lineBreakdowns = computeLineBreakdowns(lineas);
  const totals = sumTotals(lineBreakdowns);

  const invoiceLines = lineBreakdowns
    .map(
      (line, i) => `
  <cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="NIU">${line.quantity}</cbc:InvoicedQuantity>
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
  </cac:InvoiceLine>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:qdt="urn:oasis:names:specification:ubl:schema:xsd:QualifiedDatatypes-2" xmlns:udt="urn:un:unece:uncefact:data:specification:UnqualifiedDataTypesSchemaModule:2" xmlns:sac="urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1">
  ${UBL_EXTENSIONS_PLACEHOLDER}
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${serie}-${numero}</cbc:ID>
  <cbc:IssueDate>${formatDate(fechaEmision)}</cbc:IssueDate>
  <cbc:InvoiceTypeCode listID="0101" listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">${tipoDocumento}</cbc:InvoiceTypeCode>
  <cbc:Note languageLocaleID="1000">${cdata(montoEnLetras(totals.totalVenta))}</cbc:Note>
  <cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode>
  ${buildSignatureBlock(emisor.ruc, emisor.businessName)}
  ${buildSupplierPartyBlock(emisor)}
  ${buildCustomerPartyBlock(cliente)}
  <cac:PaymentTerms>
    <cbc:ID>FormaPago</cbc:ID>
    <cbc:PaymentMeansID>Contado</cbc:PaymentMeansID>
  </cac:PaymentTerms>
  ${buildTaxTotalBlock(totals)}
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="PEN">${formatAmount(totals.totalGravada)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="PEN">${formatAmount(totals.totalVenta)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="PEN">${formatAmount(totals.totalVenta)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${invoiceLines}
</Invoice>`;
}
