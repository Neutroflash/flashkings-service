import { IProductRepository } from "../../domain/repositories/IProductRepository";
import { IUserRepository } from "../../domain/repositories/IUserRepository";
import { IEmailService } from "../../domain/services/IEmailService";
import { logger } from "../../infrastructure/logging/logger";

/**
 * Invocado por el job recurrente diario (BullMQ) — escanea el catálogo completo y, si hay algo
 * bajo del umbral, manda UN correo (no uno por SKU) a cada ADMIN. Nunca lanza: un fallo de envío
 * para un admin no debe frenar el resto (mismo criterio best-effort que el resto del proyecto).
 */
export class RunLowStockDigestUseCase {
  constructor(
    private readonly productRepository: IProductRepository,
    private readonly userRepository: IUserRepository,
    private readonly emailService: IEmailService,
  ) {}

  async execute(threshold: number): Promise<number> {
    const lowStock = await this.productRepository.findVariantsBelowThreshold(threshold);
    if (lowStock.length === 0) return 0;

    const admins = await this.userRepository.findAdmins();
    let notified = 0;
    for (const admin of admins) {
      try {
        await this.emailService.sendLowStockDigestEmail(admin, lowStock, threshold);
        notified++;
      } catch (err) {
        logger.error({ err, adminId: admin.id }, "[low-stock] no se pudo enviar el correo");
      }
    }
    return notified;
  }
}
