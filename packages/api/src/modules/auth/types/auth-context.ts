export interface AuthContext {
  id: string;
  dealershipId: string;
  roles: string[];
}

export interface JwtPayload {
  sub: string;
  dealership_id: string;
  roles: string[];
  iat?: number;
  exp?: number;
  jti?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
