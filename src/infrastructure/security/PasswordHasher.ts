import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export const PasswordHasher = {
  hash(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, SALT_ROUNDS);
  },
  compare(plainPassword: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hash);
  },
};
