import { User } from "../entities/User";

export interface CreateUserData {
  email: string;
  passwordHash: string;
  name: string;
}

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
}
