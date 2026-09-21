import { authFetch } from './api-client.js';

export async function attendanceApi(action, payload = {}) {
  const response = await authFetch('/api/sync-absen', {
    method: 'POST',
    body: JSON.stringify({ action, ...payload })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }
  return result;
}

export async function listAttendance(payload = {}) {
  const result = await attendanceApi('attendance_list', payload);
  return result.rows || [];
}
