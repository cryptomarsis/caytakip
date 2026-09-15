export interface QuotaPlan { id: string; label: string; season: string; startDate: string; endDate: string; area: number; quotaRate: number | null; dailyRate: number | null; dailyDate: string; openingKg: number; source: string; recordIds: string[] }
export function validateQuotaPlans(input: unknown): QuotaPlan[];
export function totalQuotaKg(plan: QuotaPlan): number | null;
export function withTotalQuota(plan: QuotaPlan, total: number): QuotaPlan;
export function eligibleRecord(plan: QuotaPlan, record: { firma?: string; surum?: string; tarih?: string }): boolean;
export function isCaykur(name: unknown): boolean;
export interface QuotaRecord { _id: string; quotaPlanId?: string; firma?: string; surum?: string; tarih?: string; kg?: number | string; weight?: number | string }
export function linkedRecord(plan: QuotaPlan, record: QuotaRecord): boolean;
export function resolveQuotaPlan(plans: QuotaPlan[], record: Partial<QuotaRecord>, requestedId?: string): string;
export function calculateQuota(plan: QuotaPlan, records: QuotaRecord[], today: string): {delivered: number; todayKg: number; remaining: number | null; dayRemaining: number | null; invalid: number; active: boolean; recordCount: number; available: number | null; overQuota: boolean};
