import { calculateTaxBreakdown } from "./tax";
import type { SunatCustomerInfo, SunatInvoiceLine, SunatPartyInfo } from "./types";

/** Blinda un CDATA contra el único caso en que "]]>" dentro del texto rompería el cierre. */
export function cdata(text: string): string {
  return `<![CDATA[${text.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

export function formatAmount(n: number): string {
  return n.toFixed(2);
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export interface LineBreakdown extends SunatInvoiceLine {
  lineTotal: number;
  taxedAmount: number;
  igvAmount: number;
  unitValue: number;
}

export function computeLineBreakdowns(lineas: SunatInvoiceLine[]): LineBreakdown[] {
  return lineas.map((line) => {
    const lineTotal = line.unitPriceWithTax * line.quantity;
    const { taxedAmount, igvAmount } = calculateTaxBreakdown(lineTotal);
    const unitValue = line.quantity > 0 ? taxedAmount / line.quantity : 0;
    return { ...line, lineTotal, taxedAmount, igvAmount, unitValue };
  });
}

export interface DocumentTotals {
  totalGravada: number;
  totalIgv: number;
  totalVenta: number;
}

export function sumTotals(breakdowns: LineBreakdown[]): DocumentTotals {
  return {
    totalGravada: breakdowns.reduce((sum, l) => sum + l.taxedAmount, 0),
    totalIgv: breakdowns.reduce((sum, l) => sum + l.igvAmount, 0),
    totalVenta: breakdowns.reduce((sum, l) => sum + l.lineTotal, 0),
  };
}

/** `ext:UBLExtensions` con el `ExtensionContent` vacío que `sign.ts` completa después — idéntico
 * para Invoice/CreditNote/DebitNote, todos comparten el mismo mecanismo de extensión UBL. */
export const UBL_EXTENSIONS_PLACEHOLDER = `<ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent></ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>`;

export function buildSignatureBlock(emisorRuc: string, emisorBusinessName: string): string {
  return `<cac:Signature>
    <cbc:ID>${emisorRuc}</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification>
        <cbc:ID>${emisorRuc}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${cdata(emisorBusinessName)}</cbc:Name>
      </cac:PartyName>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment>
      <cac:ExternalReference>
        <cbc:URI>#SunatSignature</cbc:URI>
      </cac:ExternalReference>
    </cac:DigitalSignatureAttachment>
  </cac:Signature>`;
}

/**
 * `cbc:AddressTypeCode` ("0000" = domicilio fiscal, el código de establecimiento anexo por
 * default cuando el negocio no tiene sucursales registradas ante SUNAT aparte) — encontrado como
 * bug real probando FACTURA en vivo contra `e-beta.sunat.gob.pe`: BOLETA lo acepta sin este tag,
 * FACTURA lo rechaza con "INFO: 3030 ... no existe información del código de local anexo del
 * emisor". Siempre presente ahora (Boleta lo sigue aceptando igual con el tag de más).
 */
export function buildSupplierPartyBlock(emisor: SunatPartyInfo): string {
  return `<cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6">${emisor.ruc}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${cdata(emisor.businessName)}</cbc:RegistrationName>
        <cac:RegistrationAddress>
          <cbc:AddressTypeCode>0000</cbc:AddressTypeCode>
          ${emisor.address ? `<cac:AddressLine><cbc:Line>${cdata(emisor.address)}</cbc:Line></cac:AddressLine>` : ""}
        </cac:RegistrationAddress>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>`;
}

export function buildCustomerPartyBlock(cliente: SunatCustomerInfo): string {
  return `<cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${cliente.documentTypeCode}">${cliente.documentNumber}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${cdata(cliente.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>`;
}

export function buildTaxTotalBlock(totals: DocumentTotals): string {
  return `<cac:TaxTotal>
    <cbc:TaxAmount currencyID="PEN">${formatAmount(totals.totalIgv)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="PEN">${formatAmount(totals.totalGravada)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="PEN">${formatAmount(totals.totalIgv)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:ID>1000</cbc:ID>
          <cbc:Name>IGV</cbc:Name>
          <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>`;
}

/** Bloque de impuestos por línea (`cac:TaxTotal` dentro de una InvoiceLine/CreditNoteLine/
 * DebitNoteLine) — mismo formato en los tres tipos de documento. */
export function buildLineTaxTotalBlock(line: LineBreakdown): string {
  return `<cac:TaxTotal>
      <cbc:TaxAmount currencyID="PEN">${formatAmount(line.igvAmount)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="PEN">${formatAmount(line.taxedAmount)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="PEN">${formatAmount(line.igvAmount)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:Percent>18</cbc:Percent>
          <cbc:TaxExemptionReasonCode>10</cbc:TaxExemptionReasonCode>
          <cac:TaxScheme>
            <cbc:ID>1000</cbc:ID>
            <cbc:Name>IGV</cbc:Name>
            <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>`;
}
