// Public demo mode: lets an evaluator open the dashboard without an email or password.
// Off unless DASHBOARD_PUBLIC_DEMO is exactly "true". While on, the dashboard is read-only (no password changes,
// no sign-in), shows only masked phone numbers, and displays a banner. It must stay off for real callers' data.
export const isPublicDemo = () => process.env.DASHBOARD_PUBLIC_DEMO === "true";
