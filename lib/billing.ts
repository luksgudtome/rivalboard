export const FREE_TOURNAMENT_LIMIT = 1;
export const BILLING_DISABLED_MESSAGE = "Billing is disabled while Rivalboard is in testing.";

export type SubscriptionPlanValue = "free" | "pro";

function isEnabledFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isBillingEnabled(): boolean {
  return isEnabledFlag(process.env.NEXT_PUBLIC_BILLING_ENABLED);
}

export function isProPlan(plan: SubscriptionPlanValue): boolean {
  return plan === "pro";
}

export function planLabel(plan: SubscriptionPlanValue): string {
  return isProPlan(plan) ? "PRO" : "FREE";
}
