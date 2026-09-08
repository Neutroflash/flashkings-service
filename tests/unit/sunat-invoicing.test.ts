import { describe, expect, test } from "bun:test";
import { calculateTaxBreakdown, IGV_RATE } from "../../src/infrastructure/invoicing/sunat/tax";
import { generateInvoiceXML } from "../../src/infrastructure/invoicing/sunat/xml-builder";
import { generateCreditNoteXML } from "../../src/infrastructure/invoicing/sunat/note-xml-builder";
import { computeLineBreakdowns, sumTotals } from "../../src/infrastructure/invoicing/sunat/xml-common";
import {
  CREDIT_NOTE_REASONS,
  findNoteReason,
  resolveNoteSeries,
  voidsRelatedInvoice,
} from "../../src/infrastructure/invoicing/sunat/note-catalogs";
import type { SunatCustomerInfo, SunatPartyInfo } from "../../src/infrastructure/invoicing/sunat/types";

const emisor: SunatPartyInfo = {
  ruc: "20000000001",
  businessName: "FLASHKINGS S.A.C.",
  address: "Av. Principal 123, Lima",
};

const cliente: SunatCustomerInfo = {
  documentTypeCode: "1",
  documentNumber: "12345678",
  name: "Cliente de Prueba",
};

/** Extrae el primer valor de un tag del XML, para no depender de parsear todo el documento. */
function tagValue(xml: string, tag: string): string | undefined {
  return xml.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`))?.[1];
}

function allTagValues(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "g"))].map((m) => m[1]);
}

describe("desglose de IGV", () => {
  test("el precio ya incluye IGV: el desglose va hacia atrás desde el total", () => {
    const { taxedAmount, igvAmount } = calculateTaxBreakdown(118);
    expect(taxedAmount).toBe(100);
    expect(igvAmount).toBe(18);
  });

  test("valor gravado + IGV siempre reconstruye el total, con céntimos incómodos", () => {
    for (const total of [0.01, 1, 149.9, 164.9, 999.99, 12345.67]) {
      const { taxedAmount, igvAmount } = calculateTaxBreakdown(total);
      expect(Math.round((taxedAmount + igvAmount) * 100) / 100).toBe(total);
    }
  });

  test("todo se reporta como gravado: este negocio no vende exonerado ni inafecto", () => {
    const breakdown = calculateTaxBreakdown(500);
    expect(breakdown.exemptAmount).toBe(0);
    expect(breakdown.unaffectedAmount).toBe(0);
  });

  test("la tasa es 18%", () => {
    expect(IGV_RATE).toBe(0.18);
  });
});

describe("totales del documento", () => {
  /**
   * SUNAT valida que las líneas sustenten los totales del propio documento, no que el IGV se
   * recalcule sobre el gran total. Las dos cifras cuadran contra el total pero difieren en
   * céntimos, y la del documento es la que se suma por línea — este test fija ese criterio para
   * que nadie lo "corrija" a la otra forma.
   */
  test("el IGV se suma por línea, no se calcula sobre el gran total", () => {
    const lineas = [
      { description: "Teclado", quantity: 1, unitPriceWithTax: 149.9 },
      { description: "Envío", quantity: 1, unitPriceWithTax: 15 },
    ];
    const totals = sumTotals(computeLineBreakdowns(lineas));

    expect(totals.totalGravada).toBeCloseTo(139.74, 2);
    expect(totals.totalIgv).toBeCloseTo(25.16, 2);
    expect(totals.totalVenta).toBeCloseTo(164.9, 2);

    // El desglose sobre el gran total da un céntimo distinto — a propósito.
    const sobreElTotal = calculateTaxBreakdown(164.9);
    expect(sobreElTotal.taxedAmount).toBeCloseTo(139.75, 2);
    expect(totals.totalGravada).not.toBeCloseTo(sobreElTotal.taxedAmount, 2);
  });
});

describe("XML de boleta / factura", () => {
  const payload = {
    tipoDocumento: "03" as const,
    serie: "B001",
    numero: 7,
    fechaEmision: new Date("2026-09-07T10:00:00Z"),
    emisor,
    cliente,
    lineas: [{ description: "Teclado FK-87 (FK87-RED)", quantity: 2, unitPriceWithTax: 349.9 }],
  };

  test("declara UTF-8: el encoding equivocado rompe el digest de la firma", () => {
    // Bug real del proyecto de origen: declarar ISO-8859-1 mientras se envían bytes UTF-8 hace
    // que SUNAT canonicalice distinto y rechace con "Incorrect reference digest value" — solo se
    // dispara con texto acentuado, que cualquier razón social peruana tiene tarde o temprano.
    expect(generateInvoiceXML(payload)).toContain('encoding="UTF-8"');
  });

  test("lleva AddressTypeCode del emisor: sin él SUNAT rechaza la factura", () => {
    // Bug real encontrado en vivo: la boleta se aceptaba sin el tag, la factura no.
    expect(generateInvoiceXML(payload)).toContain("<cbc:AddressTypeCode>0000</cbc:AddressTypeCode>");
  });

  test("lleva PaymentTerms: el otro tag que faltaba en la factura rechazada", () => {
    expect(generateInvoiceXML(payload)).toContain("<cac:PaymentTerms>");
  });

  test("el tipo de documento viaja en InvoiceTypeCode (03 boleta / 01 factura)", () => {
    expect(tagValue(generateInvoiceXML(payload), "cbc:InvoiceTypeCode")).toBe("03");
    expect(tagValue(generateInvoiceXML({ ...payload, tipoDocumento: "01" }), "cbc:InvoiceTypeCode")).toBe("01");
  });

  test("deja el hueco de UBLExtensions que la firma XAdES rellena después", () => {
    expect(generateInvoiceXML(payload)).toContain("<ext:ExtensionContent></ext:ExtensionContent>");
  });

  test("el total pagable cuadra con precio × cantidad", () => {
    expect(tagValue(generateInvoiceXML(payload), "cbc:PayableAmount")).toBe("699.80");
  });
});

describe("XML de nota de crédito", () => {
  const notePayload = {
    serie: "BC01",
    numero: 3,
    fechaEmision: new Date("2026-09-07T10:00:00Z"),
    emisor,
    cliente,
    lineas: [{ description: "Teclado FK-87 (FK87-RED)", quantity: 1, unitPriceWithTax: 149.9 }],
    documentoRelacionado: { serie: "B001", numero: 5, tipoDocumento: "03" as const },
    motivoCodigo: "06",
    motivoDescripcion: "Devolución total",
  };

  test("es un CreditNote, no un Invoice", () => {
    const xml = generateCreditNoteXML(notePayload);
    expect(xml).toContain("<CreditNote xmlns=");
    expect(xml).toContain("<cac:CreditNoteLine>");
    expect(xml).toContain("<cbc:CreditedQuantity");
    expect(xml).not.toContain("InvoicedQuantity");
  });

  /** Sin este par de bloques SUNAT la lee como comprobante suelto y la rechaza. */
  test("apunta al documento que corrige y dice por qué", () => {
    const xml = generateCreditNoteXML(notePayload);
    expect(tagValue(xml, "cbc:ReferenceID")).toBe("B001-5");
    expect(tagValue(xml, "cbc:ResponseCode")).toBe("06");
    expect(tagValue(xml, "cbc:DocumentTypeCode")).toBe("03");
  });

  test("no lleva InvoiceTypeCode: el 07 viaja en el nombre del ZIP, no en el XML", () => {
    expect(generateCreditNoteXML(notePayload)).not.toContain("InvoiceTypeCode");
  });

  test("preserva las tildes del motivo — el caso que disparó el bug de encoding", () => {
    const xml = generateCreditNoteXML({ ...notePayload, motivoDescripcion: "Anulación de la operación" });
    expect(xml).toContain("Anulación de la operación");
    expect(xml).toContain('encoding="UTF-8"');
  });

  test("con línea de envío, las líneas suman exactamente el monto devuelto", () => {
    const xml = generateCreditNoteXML({
      ...notePayload,
      lineas: [
        { description: "Teclado FK-87 (FK87-RED)", quantity: 1, unitPriceWithTax: 149.9 },
        { description: "Servicio de entrega a domicilio", quantity: 1, unitPriceWithTax: 15 },
      ],
    });

    expect(allTagValues(xml, "cac:CreditNoteLine").length).toBe(0); // no es un tag con texto
    expect((xml.match(/<cac:CreditNoteLine>/g) ?? []).length).toBe(2);
    expect(tagValue(xml, "cbc:PayableAmount")).toBe("164.90");
    expect(xml).toContain("Servicio de entrega a domicilio");
  });
});

describe("catálogo 09 de SUNAT", () => {
  test("solo acepta códigos del catálogo", () => {
    expect(findNoteReason("NOTA_CREDITO", "06")?.label).toBe("Devolución total");
    expect(findNoteReason("NOTA_CREDITO", "99")).toBeUndefined();
    expect(CREDIT_NOTE_REASONS.length).toBe(10);
  });

  /** La serie depende de qué documento corrige: son secuencias correlativas independientes. */
  test("la serie sale del tipo del documento corregido", () => {
    expect(resolveNoteSeries("BOLETA")).toBe("BC01");
    expect(resolveNoteSeries("FACTURA")).toBe("FC01");
  });

  test("solo los motivos de anulación total dejan el comprobante en VOID", () => {
    expect(voidsRelatedInvoice("01")).toBe(true);
    expect(voidsRelatedInvoice("06")).toBe(true);
    // Un descuento o una devolución por ítem lo dejan vigente con monto corregido.
    expect(voidsRelatedInvoice("04")).toBe(false);
    expect(voidsRelatedInvoice("07")).toBe(false);
  });
});
