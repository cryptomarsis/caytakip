import { createContext, useContext } from 'react';
import type { ProStatus } from '../services/proAccess';

export const AdAccessContext = createContext<ProStatus>('unknown');
export const useAdAccess = () => {
  const status = useContext(AdAccessContext);
  return { status, isPro: status === 'pro', adsAllowed: status === 'free' };
};
