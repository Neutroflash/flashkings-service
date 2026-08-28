import { IUserRepository } from "../../domain/repositories/IUserRepository";
import { IOrderRepository } from "../../domain/repositories/IOrderRepository";
import { PasswordHasher } from "../../infrastructure/security/PasswordHasher";
import { ConflictError } from "../../shared/errors/AppError";
import { SafeUser, toSafeUser } from "../../domain/entities/User";

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export class RegisterUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly orderRepository: IOrderRepository,
  ) {}

  async execute(input: RegisterInput): Promise<SafeUser> {
    const existing = await this.userRepository.findByEmail(input.email);
    if (existing) {
      throw new ConflictError("Ya existe una cuenta con este correo electrónico");
    }

    const passwordHash = await PasswordHasher.hash(input.password);
    const user = await this.userRepository.create({
      email: input.email,
      passwordHash,
      name: input.name,
    });

    // Claims any past guest orders placed with this email — see the comment on
    // IOrderRepository.linkOrdersToUser.
    await this.orderRepository.linkOrdersToUser(user.email, user.id);

    return toSafeUser(user);
  }
}
