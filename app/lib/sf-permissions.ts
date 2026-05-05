/**
 * app/lib/sf-permissions.ts
 *
 * Shared permission constants — safe to import on both client AND server.
 * (Not .server.ts so the admin page's JSX can reference these.)
 */

export const SF_MODULES = [
  'dashboard', 'onboarding', 'reorders', 'leads',
  'orders', 'accounts', 'funnel', 'email', 'text',
  'issues', 'vibes', 'admin',
] as const;

export const SF_FEATURES = [
  'accounts.export_csv',
  'accounts.delete',
  'accounts.create',
  'orders.create',
  'accounts.flag_pete',
] as const;
