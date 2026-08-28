import { IUserRepository } from "../../domain/repositories/IUserRepository";
import { SafeUser, toSafeUser } from "../../domain/entities/User";

// The JWT payload (req.user) only carries id/email/role — not name/phone/defaultAddress, since
// those can change after the token was issued. GET /auth/me needs the real row so the client
// account page has something to render/prefill.
export class GetCurrentUserUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(userId: string): Promise<SafeUser | null> {
    const user = await this.userRepository.findById(userId);
    return user ? toSafeUser(user) : null;
  }
}
