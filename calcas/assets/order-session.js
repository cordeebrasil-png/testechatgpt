export const SESSION_KEY = 'cordee.calcas.ironpayOrder';
export const INTENT_KEY = 'cordee.calcas.ironpayIntent';
export const VERSION = 'pix-live-v2';
export function readSession(key = SESSION_KEY) {
  try {
    const session = JSON.parse(sessionStorage.getItem(key) || 'null');
    return /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(session?.id || '') && /^[a-f0-9]{64}$/.test(session?.accessToken || '') ? session : null;
  } catch { return null; }
}
export function diagnostic(values) {
  // Safe to share: no access token, Pix code or customer data.
  window.__mareAzulPixDiagnostics = Object.freeze({ version: VERSION, page: location.pathname,
    code: values.code || null, httpStatus: values.httpStatus || null,
    orderStatus: values.orderStatus || null, hasPix: Boolean(values.hasPix),
    hasSession: Boolean(readSession()), checkedAt: new Date().toISOString() });
}
export async function readJson(response) {
  if (!response.headers.get('Content-Type')?.includes('application/json')) throw new Error('API_RESPONSE_INVALID');
  try { return await response.json(); } catch { throw new Error('API_RESPONSE_INVALID'); }
}
export function validOrder(data, id) {
  return data?.id === id && ['creating', 'uncertain', 'rejected', 'pending', 'paid', 'canceled', 'refunded'].includes(data.status);
}
