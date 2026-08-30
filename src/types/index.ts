export interface UserSession {
  userId: string;
  name: string;
  phone: string;
  role: 'admin' | 'user';
  token: string;
  refreshToken: string;
}

export * from './records';
