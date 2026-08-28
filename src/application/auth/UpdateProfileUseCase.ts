import { IUserRepository, UpdateProfileData } from "../../domain/repositories/IUserRepository";
import { SafeUser, toSafeUser } from "../../domain/entities/User";

export class UpdateProfileUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(userId: string, data: UpdateProfileData): Promise<SafeUser> {
    const user = await this.userRepository.updateProfile(userId, data);
    return toSafeUser(user);
  }
}
