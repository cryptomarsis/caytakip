export interface QuotaPlan { id: string; label: string; season: string; startDate: string; endDate: string; area: number; quotaRate: number | null; dailyRate: number | null; dailyDate: string; openingKg: number; source: string; recordIds: string[] }
export function validateQuotaPlans(input: unknown): QuotaPlan[];
export function eligibleRecord(plan: QuotaPlan, record: { firma?: string; surum?: string; tarih?: string }): boolean;
export function isCaykur(name: unknown): boolean;
export function calculateQuota(plan: QuotaPlan, records: {_id: string; firma?: string; surum?: string; tarih?: string; kg?: number | string; weight?: number | string}[], today: string): {delivered: number; todayKg: number; remaining: number | null; dayRemaining: number | null; invalid: number; active: boolean; available: number | null; overQuota: boolean};
