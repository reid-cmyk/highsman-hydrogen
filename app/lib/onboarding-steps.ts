/**
 * app/lib/onboarding-steps.ts
 * Canonical 12-step onboarding sequence — shared between:
 *   - /sales-staging/account/:id  (checklist panel)
 *   - /sales-staging/onboarding   (onboarding feed)
 *
 * popup_booked is NJ-only and filtered out for other markets.
 */

export const ONBOARDING_STEPS: {key: string; label: string; njOnly?: boolean}[] = [
  {key: 'contacts_added',          label: 'Contacts added to CRM'},
  {key: 'digital_assets_sent',     label: 'Digital assets sent'},
  {key: 'social_story_graphic',    label: 'Social story graphic created'},
  {key: 'samples_sent',            label: 'Samples sent with order'},
  {key: 'promo_scheduled',         label: 'Launch promo scheduled'},
  {key: 'merchandised',            label: 'Merchandised'},
  {key: 'budtenders_trained',      label: 'Budtenders trained'},
  {key: 'popup_booked',            label: 'Pop-up booked', njOnly: true},
  {key: 'store_locator_confirmed', label: 'Store locator confirmed'},
  {key: 'menu_accurate',           label: 'Menu accuracy confirmed'},
  {key: 'social_story_posted',     label: 'Social story posted'},
  {key: 'feedback_obtained',       label: 'Initial feedback obtained'},
];

export const TOTAL_STEPS = ONBOARDING_STEPS.length; // 12 (11 for non-NJ)

export function stepsForMarket(marketState: string | null) {
  const isNJ = marketState === 'NJ';
  return ONBOARDING_STEPS.filter(s => !s.njOnly || isNJ);
}
