import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import { User } from "../../../domain/entities/User";
import { emailColors } from "../emailTheme";

export interface PasswordResetEmailProps {
  user: User;
  resetUrl: string;
}

export function PasswordResetEmail({ user, resetUrl }: PasswordResetEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Recupera tu contraseña</Preview>
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

          <Heading style={{ color: emailColors.text, fontSize: 20, margin: "20px 0 8px" }}>Recupera tu contraseña</Heading>
          <Text style={{ color: emailColors.muted, fontSize: 14, lineHeight: "20px" }}>
            Hola {user.name}, recibimos una solicitud para restablecer tu contraseña. Si no fuiste tú, ignora este correo.
          </Text>

          <Button
            href={resetUrl}
            style={{
              backgroundColor: emailColors.gold,
              color: "#121212",
              fontWeight: 700,
              borderRadius: 6,
              padding: "12px 24px",
              marginTop: 20,
              textDecoration: "none",
              fontSize: 14,
              display: "inline-block",
            }}
          >
            Restablecer contraseña
          </Button>

          <Text style={{ color: emailColors.muted, fontSize: 12, marginTop: 24 }}>
            Este enlace vence en 30 minutos. Si el botón no funciona, copia y pega este link: {resetUrl}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default PasswordResetEmail;
