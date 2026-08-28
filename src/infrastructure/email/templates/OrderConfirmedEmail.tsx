import { Body, Button, Column, Container, Head, Heading, Hr, Html, Preview, Row, Section, Text } from "@react-email/components";
import { Order } from "../../../domain/entities/Order";
import { emailColors, FRONTEND_URL } from "../emailTheme";

export interface OrderConfirmedEmailProps {
  order: Order;
}

export function OrderConfirmedEmail({ order }: OrderConfirmedEmailProps) {
  const shortId = order.id.slice(0, 8);

  return (
    <Html>
      <Head />
      <Preview>Confirmamos tu pago — Pedido #{shortId}</Preview>
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

          <Heading style={{ color: emailColors.text, fontSize: 20, margin: "20px 0 8px" }}>¡Pago confirmado!</Heading>
          <Text style={{ color: emailColors.muted, fontSize: 14, lineHeight: "20px" }}>
            Hola {order.customerName}, recibimos tu pago correctamente. Este es el comprobante de tu pedido.
          </Text>

          <Hr style={{ borderColor: emailColors.border, margin: "20px 0" }} />

          {order.items.map((item) => (
            <Row key={item.id} style={{ marginBottom: 8 }}>
              <Column>
                <Text style={{ color: emailColors.text, fontSize: 14, margin: 0 }}>
                  {item.productVariant?.name ?? "Producto"} x{item.quantity}
                </Text>
              </Column>
              <Column align="right">
                <Text style={{ color: emailColors.text, fontSize: 14, margin: 0 }}>
                  S/ {(item.price * item.quantity).toFixed(2)}
                </Text>
              </Column>
            </Row>
          ))}

          <Hr style={{ borderColor: emailColors.border, margin: "20px 0" }} />

          <Row>
            <Column>
              <Text style={{ color: emailColors.text, fontWeight: 700, fontSize: 16, margin: 0 }}>Total</Text>
            </Column>
            <Column align="right">
              <Text style={{ color: emailColors.gold, fontWeight: 700, fontSize: 16, margin: 0 }}>
                S/ {order.totalAmount.toFixed(2)}
              </Text>
            </Column>
          </Row>

          <Section style={{ marginTop: 24 }}>
            <Text style={{ color: emailColors.muted, fontSize: 12, margin: 0, textTransform: "uppercase" }}>
              Dirección de envío
            </Text>
            <Text style={{ color: emailColors.text, fontSize: 14, margin: "4px 0 0" }}>{order.shippingAddress}</Text>
          </Section>

          <Button
            href={`${FRONTEND_URL}/pedido/${order.id}/confirmacion`}
            style={{
              backgroundColor: emailColors.gold,
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
            Pedido #{order.id} — Flashkings Perú. Prepararemos tu pedido y te avisaremos cuando salga a reparto.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default OrderConfirmedEmail;
