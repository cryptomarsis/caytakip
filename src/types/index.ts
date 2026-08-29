export interface UserSession {
  userId: string;
  name: string;
  phone: string;
  role: 'admin' | 'user';
  token: string;
  refreshToken: string;
  workTypes?: Array<'producer' | 'sharecropper' | 'worker' | string>;
}

export * from './records';
