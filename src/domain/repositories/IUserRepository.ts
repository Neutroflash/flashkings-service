import { User } from "../entities/User";

export interface CreateUserData {
  email: string;
  passwordHash: string;
  name: string;
}

export interface UpdateProfileData {
  name?: string;
  phone?: string | null;
  defaultAddress?: string | null;
}

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
  updateProfile(userId: string, data: UpdateProfileData): Promise<User>;
}
