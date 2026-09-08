import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";
import { Order } from "../../../domain/entities/Order";
import { Refund } from "../../../domain/entities/Refund";
import { emailColors, FRONTEND_URL } from "../emailTheme";

export interface OrderRefundedEmailProps {
  order: Order;
  refund: Refund;
}

function formatSoles(amount: number): string {
  return `S/ ${amount.toFixed(2)}`;
}

export function OrderRefundedEmail({ order, refund }: OrderRefundedEmailProps) {
  const shortId = order.id.slice(0, 8);
  // Un reembolso que todavía no salió de la pasarela no se anuncia como hecho — el cliente que
  // revisa su tarjeta y no ve nada abre un reclamo, y con razón.
  const settled = refund.status === "COMPLETED";

  return (
    <Html>
      <Head />
      <Preview>
        {settled ? `Devolvimos ${formatSoles(refund.amount)} de tu pedido #${shortId}` : `Tu devolución del pedido #${shortId} está en proceso`}
      </Preview>
      <Body style={{ backgroundColor: emailColors.bg, fontFamily: "Helvetica, Arial, sans-serif", margin: 0, padding: "32px 0" }}>
        <Container
          style={{
            backgroundColor: emailColors.card,
            borderRadius: 8,
            padding: 32,
            maxWidth: 480,
            border: `1px solid ${emailColors.border}`,
          }}
        >
          <Text style={{ color: emailColors.gold, fontSize: 22, fontWeight: 700, letterSpacing: 1, margin: 0 }}>
            FLASH<span style={{ color: emailColors.blue }}>KINGS</span>
          </Text>

          <Heading style={{ color: emailColors.text, fontSize: 20, margin: "20px 0 8px" }}>
            {settled ? "Tu devolución fue procesada" : "Tu devolución está en proceso"}
          </Heading>
          <Text style={{ color: emailColors.muted, fontSize: 14, lineHeight: "20px" }}>
            Hola {order.customerName}, {refund.isFull ? "devolvimos el total de tu pedido" : "devolvimos parte de tu pedido"} #{shortId}.
          </Text>

          <Hr style={{ borderColor: emailColors.border, margin: "20px 0" }} />

          <Section>
            <Text style={{ color: emailColors.muted, fontSize: 12, margin: 0, textTransform: "uppercase" }}>
              Monto devuelto
            </Text>
            <Text style={{ color: emailColors.gold, fontSize: 24, fontWeight: 700, margin: "4px 0 16px" }}>
              {formatSoles(refund.amount)}
            </Text>

            <Text style={{ color: emailColors.muted, fontSize: 12, margin: 0, textTransform: "uppercase" }}>
              Motivo
            </Text>
            <Text style={{ color: emailColors.text, fontSize: 14, margin: "4px 0 16px" }}>{refund.reasonText}</Text>

            {!refund.isFull && (
              <>
                <Text style={{ color: emailColors.muted, fontSize: 12, margin: 0, textTransform: "uppercase" }}>
                  Total del pedido
                </Text>
                <Text style={{ color: emailColors.text, fontSize: 14, margin: "4px 0 0" }}>
                  {formatSoles(order.totalAmount)}
                </Text>
              </>
            )}
          </Section>

          <Text style={{ color: emailColors.muted, fontSize: 13, lineHeight: "19px", marginTop: 20 }}>
            {refund.isManual
              ? "La transferencia fue enviada al medio que acordamos contigo."
              : "El dinero vuelve al mismo medio de pago con el que compraste. Según tu banco, puede tardar unos días hábiles en reflejarse."}
          </Text>

          <Button
            href={`${FRONTEND_URL}/pedido/${order.id}/confirmacion`}
            style={{
              backgroundColor: emailColors.blue,
              color: "#121212",
              fontWeight: 700,
              borderRadius: 6,
              padding: "12px 24px",
              marginTop: 28,
              textDecoration: "none",
              fontSize: 14,
              display: "inline-block",
            }}
          >
            Ver mi pedido
          </Button>

          <Text style={{ color: emailColors.muted, fontSize: 12, marginTop: 32 }}>
            Pedido #{order.id} — Flashkings Perú.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default OrderRefundedEmail;
