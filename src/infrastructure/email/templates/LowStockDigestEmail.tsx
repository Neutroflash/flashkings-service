import { Body, Column, Container, Head, Heading, Hr, Html, Preview, Row, Text } from "@react-email/components";
import { User } from "../../../domain/entities/User";
import { ProductVariant } from "../../../domain/entities/ProductVariant";
import { emailColors } from "../emailTheme";

export interface LowStockDigestEmailProps {
  admin: User;
  variants: ProductVariant[];
  threshold: number;
}

export function LowStockDigestEmail({ admin, variants, threshold }: LowStockDigestEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`Stock bajo en ${variants.length} producto(s)`}</Preview>
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

          <Heading style={{ color: emailColors.text, fontSize: 20, margin: "20px 0 8px" }}>Stock bajo</Heading>
          <Text style={{ color: emailColors.muted, fontSize: 14, lineHeight: "20px" }}>
            Hola {admin.name}, estos productos están en o por debajo del umbral configurado ({threshold} unidades disponibles).
          </Text>

          <Hr style={{ borderColor: emailColors.border, margin: "20px 0" }} />

          {variants.map((v) => (
            <Row key={v.id} style={{ marginBottom: 8 }}>
              <Column>
                <Text style={{ color: emailColors.text, fontSize: 14, margin: 0 }}>
                  {v.name} <span style={{ color: emailColors.muted }}>({v.sku})</span>
                </Text>
              </Column>
              <Column align="right">
                <Text style={{ color: emailColors.gold, fontSize: 14, fontWeight: 700, margin: 0 }}>
                  {v.stock - v.reservedStock} disp.
                </Text>
              </Column>
            </Row>
          ))}

          <Text style={{ color: emailColors.muted, fontSize: 12, marginTop: 24 }}>
            Cambia el umbral con la variable LOW_STOCK_THRESHOLD, o desactiva este aviso con LOW_STOCK_ALERTS_ENABLED=false.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default LowStockDigestEmail;
