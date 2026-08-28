import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";
import { Order } from "../../../domain/entities/Order";
import { emailColors, FRONTEND_URL } from "../emailTheme";

export interface OrderShippedEmailProps {
  order: Order;
  trackingNumber: string | null;
  courier: string | null;
}

export function OrderShippedEmail({ order, trackingNumber, courier }: OrderShippedEmailProps) {
  const shortId = order.id.slice(0, 8);

  return (
    <Html>
      <Head />
      <Preview>Tu pedido #{shortId} está en camino</Preview>
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
            ¡Tu pedido está en camino! 🚚
          </Heading>
          <Text style={{ color: emailColors.muted, fontSize: 14, lineHeight: "20px" }}>
            Hola {order.customerName}, tu pedido #{shortId} salió de nuestro almacén y va rumbo a{" "}
            {order.shippingAddress}.
          </Text>

          <Hr style={{ borderColor: emailColors.border, margin: "20px 0" }} />

          <Section>
            <Text style={{ color: emailColors.muted, fontSize: 12, margin: 0, textTransform: "uppercase" }}>
              Courier
            </Text>
            <Text style={{ color: emailColors.text, fontSize: 14, margin: "4px 0 16px" }}>
              {courier ?? "No especificado"}
            </Text>

            <Text style={{ color: emailColors.muted, fontSize: 12, margin: 0, textTransform: "uppercase" }}>
              Número de seguimiento
            </Text>
            <Text style={{ color: emailColors.blue, fontSize: 16, fontWeight: 700, margin: "4px 0 0" }}>
              {trackingNumber ?? "Se asignará pronto"}
            </Text>
          </Section>

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
            Ver estado del pedido
          </Button>

          <Text style={{ color: emailColors.muted, fontSize: 12, marginTop: 32 }}>
            Pedido #{order.id} — Flashkings Perú.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default OrderShippedEmail;
