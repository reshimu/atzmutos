export const now = () => new Date().toISOString()
export const isExpired = (expiresAt?: string) =>
  expiresAt ? new Date(expiresAt) < new Date() : false
