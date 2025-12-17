import type { WaybillBlank, Capability as Ability } from '../types';

export function canSpoilBlank(params: {
  abilities: Set<Ability>;
  actorEmployeeId?: string | null;
  blank: WaybillBlank;
}) {
  const st = params.blank.status;
  if (st === 'used' || st === 'reserved') return { ok: false, reason: 'status_forbidden' as const };

  // складские доступные
  if (st === 'available') {
    if (params.abilities.has('blanks.spoil.warehouse')) return { ok: true as const };
    return { ok: false, reason: 'no_permission' as const };
  }

  // issued/returned — владелец
  if (st === 'issued' || st === 'returned') {
    if (params.abilities.has('blanks.spoil.override')) return { ok: true as const };
    if (
      params.abilities.has('blanks.spoil.self') &&
      params.actorEmployeeId &&
      params.actorEmployeeId === params.blank.ownerEmployeeId
    ) {
      return { ok: true as const };
    }
    return { ok: false, reason: 'not_owner' as const };
  }

  // spoiled — уже списан
  return { ok: false, reason: 'status_forbidden' as const };
}
