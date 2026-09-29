import type { ActiveTab } from '../navigation';
import type { ProStatus } from '../services/proAccess';

export type HarvestAdNavigationOptions = {
  userId?: string;
  proStatus: ProStatus;
  activeTab: ActiveTab;
  enabled: boolean;
  onNavigate: (tab: ActiveTab) => void;
};
export function useHarvestAdNavigation({ onNavigate }: HarvestAdNavigationOptions) { return onNavigate; }
