import type { User } from "firebase/auth"

export type AppUserRole = "admin" | "driver" | "customer" | "guest"

export interface AuthContextValue {
  user: User | null
  loading: boolean
  roles: AppUserRole[]
  primaryRole: AppUserRole
  isEmailVerified: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  sendVerificationEmail: () => Promise<void>
  hasRole: (role: AppUserRole | AppUserRole[]) => boolean
}
