const { requireFirebaseAuth, enforceRateLimit } = require('./security.js');

function ownsNotification(user, data = {}) {
  const candidates = [data.nik, data.nik_target, data.username, data.username_target, data.user_uid]
    .filter(value => value !== undefined && value !== null && String(value).trim())
    .map(value => String(value).trim().toLowerCase());
  return [user.nik, user.username, user.uid]
    .filter(Boolean)
    .some(value => candidates.includes(String(value).trim().toLowerCase()));
}

async function handleNotificationAccess(req, res, body = {}) {
  const context = await requireFirebaseAuth(req, res);
  if (!context) return true;
  if (!enforceRateLimit(req, res, { namespace: 'notification-access', key: context.user.uid, limit: 120, windowMs: 60_000 })) return true;
  const id = String(body.id || '').trim();
  if (!/^[A-Za-z0-9_.:-]{1,180}$/.test(id)) {
    res.status(400).json({ success: false, error: 'ID notifikasi tidak valid.' });
    return true;
  }
  const ref = context.db.collection('notifications').doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    res.status(404).json({ success: false, error: 'Notifikasi tidak ditemukan.' });
    return true;
  }
  if (!ownsNotification(context.user, snapshot.data()) && !['HRD', 'SUPERADMIN'].includes(context.user.role)) {
    res.status(403).json({ success: false, error: 'Notifikasi bukan milik akun ini.' });
    return true;
  }
  if (body.action === 'notification_mark_read') {
    await ref.set({ dibaca: true, read_at: new Date().toISOString() }, { merge: true });
    res.status(200).json({ success: true });
    return true;
  }
  if (body.action === 'notification_delete') {
    await ref.delete();
    res.status(200).json({ success: true });
    return true;
  }
  res.status(400).json({ success: false, error: 'Aksi notifikasi tidak dikenali.' });
  return true;
}

module.exports = { handleNotificationAccess, _test: { ownsNotification } };
