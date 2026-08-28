import { IEmailService } from "../../domain/services/IEmailService";
import { env } from "../../config/env";
import { ConsoleEmailService } from "./ConsoleEmailService";
import { ResendEmailService } from "./ResendEmailService";

export function createEmailService(): IEmailService {
  return env.email.provider === "resend" ? new ResendEmailService() : new ConsoleEmailService();
}
