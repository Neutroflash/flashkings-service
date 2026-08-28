import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";
import { Complaint } from "../../../domain/entities/Complaint";
import { emailColors } from "../emailTheme";

export interface ComplaintReceivedEmailProps {
  complaint: Complaint;
}

const TYPE_LABEL: Record<Complaint["type"], string> = {
  RECLAMO: "Reclamo",
  QUEJA: "Queja",
};

export function ComplaintReceivedEmail({ complaint }: ComplaintReceivedEmailProps) {
  const code = `RC-${String(complaint.correlativo).padStart(6, "0")}`;

  return (
    <Html>
      <Head />
      <Preview>Constancia de tu {TYPE_LABEL[complaint.type].toLowerCase()} — {code}</Preview>
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
            Constancia de registro — Libro de Reclamaciones
          </Heading>
          <Text style={{ color: emailColors.muted, fontSize: 14, lineHeight: "20px" }}>
            Hola {complaint.fullName}, registramos tu {TYPE_LABEL[complaint.type].toLowerCase()} correctamente. Este
            correo es tu constancia, conforme al Libro de Reclamaciones Virtual (D.S. N° 011-2011-PCM).
          </Text>

          <Hr style={{ borderColor: emailColors.border, margin: "20px 0" }} />

          <Section>
            <Text style={{ color: emailColors.muted, fontSize: 12, margin: 0, textTransform: "uppercase" }}>
              Código
            </Text>
            <Text style={{ color: emailColors.gold, fontWeight: 700, fontSize: 18, margin: "4px 0 16px" }}>{code}</Text>

            <Text style={{ color: emailColors.muted, fontSize: 12, margin: 0, textTransform: "uppercase" }}>Tipo</Text>
            <Text style={{ color: emailColors.text, fontSize: 14, margin: "4px 0 16px" }}>{TYPE_LABEL[complaint.type]}</Text>

            <Text style={{ color: emailColors.muted, fontSize: 12, margin: 0, textTransform: "uppercase" }}>
              Fecha de registro
            </Text>
            <Text style={{ color: emailColors.text, fontSize: 14, margin: "4px 0 16px" }}>
              {complaint.createdAt.toLocaleString("es-PE", { dateStyle: "long", timeStyle: "short" })}
            </Text>

            <Text style={{ color: emailColors.muted, fontSize: 12, margin: 0, textTransform: "uppercase" }}>
              Detalle
            </Text>
            <Text style={{ color: emailColors.text, fontSize: 14, margin: "4px 0 16px", whiteSpace: "pre-wrap" }}>
              {complaint.detail}
            </Text>

            <Text style={{ color: emailColors.muted, fontSize: 12, margin: 0, textTransform: "uppercase" }}>
              Tu pedido
            </Text>
            <Text style={{ color: emailColors.text, fontSize: 14, margin: "4px 0 0", whiteSpace: "pre-wrap" }}>
              {complaint.request}
            </Text>
          </Section>

          <Hr style={{ borderColor: emailColors.border, margin: "20px 0" }} />

          <Text style={{ color: emailColors.muted, fontSize: 12, marginTop: 8 }}>
            Tenemos un plazo de 15 días hábiles para responder a tu {TYPE_LABEL[complaint.type].toLowerCase()}. Te
            escribiremos a este mismo correo con nuestra respuesta.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default ComplaintReceivedEmail;
