import type { AuthFetch } from '../services/aiAssistant';
export type RewardProps = { userId: string; onEarned: () => Promise<void> | void; authFetch?: AuthFetch };
export default function RewardedAdButton(_props: RewardProps) { return null; }
