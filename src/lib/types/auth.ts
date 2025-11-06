import type { User } from "firebase/auth"

export type AppUserRole = "admin" | "driver" | "customer" | "guest"

export interface AuthContextValue {
  user: User | null
  loading: boolean
  roles: AppUserRole[]
  primaryRole: AppUserRole
  isEmailVerified: boolean
  signIn: (email: string, password: string) => Promise<void>
  requestMagicLink: (email: string, redirect?: string | null) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInWithApple: () => Promise<void>
  signOut: () => Promise<void>
  refreshUser: () => Promise<boolean>
  linkPassword: (password: string) => Promise<void>
  hasPasswordProvider: boolean
  hasRole: (role: AppUserRole | AppUserRole[]) => boolean
}
