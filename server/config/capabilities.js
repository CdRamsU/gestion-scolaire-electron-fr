'use strict';
// Route permissions continue to decide who may perform an enabled operation.
function mutationKeys(method, path) {
  if (!['POST','PUT','PATCH','DELETE'].includes(method)) return [];
  const keys = [];
  if (/^\/students(?:\/|$)/.test(path)) keys.push('features.students');
  if (/^\/spending(?:\/|$)/.test(path)) keys.push('features.spending');
  if (/\/bus-subscription$/.test(path)) keys.push('features.busPayments');
  if (/\/(fees|tuition-benefit)$/.test(path)) keys.push('features.studentFeeOverrides');
  if (path === '/payments' && method === 'POST') keys.push('features.payments');
  return keys;
}
function capabilityMiddleware(configuration) {
  return async (req, res, next) => {
    const keys = mutationKeys(req.method, req.path);
    if (!keys.length) return next();
    try {
      const values = await configuration.values();
      const blocked = keys.find(k => values[k] === false);
      if (blocked) return res.status(403).json({ error:'Capacité désactivée dans le Centre de contrôle.', feature:blocked });
      next();
    } catch(e) { next(e); }
  };
}
function isManualHistory(body, timezone, now = new Date()) {
  if (body.forceRequestedMonth) return true;
  const raw = body.created_at ?? body.createdAtOverride ?? body.createdAt;
  if (!raw) return false;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return false; // Existing payment validator handles invalid input.
  const format = new Intl.DateTimeFormat('en-CA',{timeZone:timezone});
  return format.format(date) !== format.format(now);
}
module.exports = { mutationKeys, capabilityMiddleware, isManualHistory };
