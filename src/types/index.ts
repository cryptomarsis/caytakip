export interface UserSession {
  userId: string;
  name: string;
  phone: string;
  role: 'admin' | 'manager' | 'user';
  adminPermissions?: ('view_metrics' | 'manage_users' | 'manage_prices' | 'manage_ads')[];
  token: string;
  refreshToken: string;
}

export * from './records';
