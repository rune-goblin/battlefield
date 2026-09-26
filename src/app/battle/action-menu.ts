import { offerRefusal, type ActionOffer, type ActivityOption } from '../../engine/index.js';

/** Keep temporary restrictions visible; omit tiers the unit cannot learn. */
export const reachableActivities = (options: ActivityOption[]): ActivityOption[] =>
  options.filter(option => option.cost !== null);

/** Skip a choice only when exactly one activity can currently be used. */
export function soleLegalActivity(options: ActivityOption[]): ActivityOption | null {
  const legal = reachableActivities(options).filter(option => option.legal);
  return legal.length === 1 ? legal[0] : null;
}

export function actionReason(reason: string | null): string {
  if (!reason || reason === 'no target') return 'No target in range';
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}

export function offerReason(offer: ActionOffer): string | undefined {
  const r = offerRefusal(offer);
  return r ? actionReason(r) : undefined;
}
