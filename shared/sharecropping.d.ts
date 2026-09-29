export type ShareAmounts = { grossCents: number; taxCents: number; netCents: number; cropperCents: number; ownerCents: number; taxPercent: number; denominator: number };
export type SharedDeliveryData = ShareAmounts & { kg: number; price: number; factory: string; date: string; dueDate: string };
export function shareAmounts(kg: number, price: number, denominator: number): ShareAmounts;
export function deliveryInput(body: Record<string, unknown>, denominator: number): SharedDeliveryData;
export function deliveryMessage(data: SharedDeliveryData): string;
export function deliveryChanges(before: SharedDeliveryData, after: SharedDeliveryData): string[];
