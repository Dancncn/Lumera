import { COLORS, type Claim, type Command } from './types';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isClaim(value: unknown): value is Claim {
  return isObject(value)
    && typeof value.color === 'string' && COLORS.some(color => color === value.color)
    && typeof value.num === 'number' && Number.isInteger(value.num) && value.num >= 0 && value.num <= 9;
}

/** Validate untrusted commands before either transport or engine reads their fields. */
export function isCommand(value: unknown): value is Command {
  if (!isObject(value)) return false;
  switch (value.type) {
    case 'Draw':
    case 'Fallback':
    case 'Accept':
    case 'Challenge':
      return true;
    case 'PlayFunctional':
    case 'RevealCard':
      return typeof value.cardId === 'number' && Number.isSafeInteger(value.cardId) && value.cardId >= 0;
    case 'PlayCard':
      return typeof value.cardId === 'number' && Number.isSafeInteger(value.cardId) && value.cardId >= 0
        && isClaim(value.claim);
    case 'ChooseNumber':
      return Array.isArray(value.ns) && value.ns.length >= 1 && value.ns.length <= 6
        && value.ns.every(n => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 6)
        && new Set(value.ns).size === value.ns.length;
    default:
      return false;
  }
}
