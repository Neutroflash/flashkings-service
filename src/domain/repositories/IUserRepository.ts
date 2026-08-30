import { User } from "../entities/User";

export interface CreateUserData {
  email: string;
  passwordHash: string;
  name: string;
  /** Seteado en la misma creación (no una segunda escritura aparte) — el usuario nace ya con su
   * token de verificación de email listo para mandar. */
  emailVerificationTokenHash?: string;
  emailVerificationTokenExpiresAt?: Date;
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

  setPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findByPasswordResetToken(tokenHash: string): Promise<User | null>;
  /** Setea el nuevo hash de contraseña y limpia el token en la misma escritura — de un solo uso. */
  resetPassword(userId: string, passwordHash: string): Promise<void>;

  setEmailVerificationToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findByEmailVerificationToken(tokenHash: string): Promise<User | null>;
  markEmailVerified(userId: string): Promise<void>;

  /** Destinatarios del aviso de stock bajo (y de cualquier otro aviso operativo futuro). */
  findAdmins(): Promise<User[]>;
}
