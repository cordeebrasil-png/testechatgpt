import { calcasConfig } from '../_lib/calcas.js';
import { CALCAS_PREVIEW_AMOUNT } from '../../shared/calcas.js';
export function onRequestGet({env}) {
  const config = calcasConfig(env);
  return Response.json({ configured: config.configured, amount: config.amount || CALCAS_PREVIEW_AMOUNT },
    {headers: {'Cache-Control':'no-store'}});
}
