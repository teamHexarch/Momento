// An account's plan decides both its limits and its powers:
//   free, plus  3 devices logged in at once
//   admin       no device limit (every new account since 2026-11-10)
//   staff       everything admin has, plus the staff tools under /api/admin (moderation, reports, takedowns,
//               emergency switches). Needs a confirmed email.
// The API never accepts a plan from a request; only scripts/setPlan.js on the server changes one.
export const PLANS = ['free', 'plus', 'admin', 'staff'];
export const ADMIN_PLANS = ['admin', 'staff'];
export const isStaffPlan = (plan) => plan === 'staff';
