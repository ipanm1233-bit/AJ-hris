import { auth, appCheck, getAppCheckToken } from './firebase-config.js';

export async function waitForAuthReady() {
  if (typeof auth.authStateReady === 'function') await auth.authStateReady();
  return auth.currentUser;
}

export async function authFetch(url, options = {}) {
  await waitForAuthReady();
  const user = auth.currentUser;
  if (!user) throw new Error('Sesi login telah berakhir. Silakan login kembali.');
  const token = await user.getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (appCheck) {
    try {
      const appCheckResult = await getAppCheckToken(appCheck, false);
      if (appCheckResult?.token) headers.set('X-Firebase-AppCheck', appCheckResult.token);
    } catch (error) {
      console.warn('App Check token unavailable:', error.message);
    }
  }
  if (options.body && !headers.has('Content-Type') && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    throw new Error('Sesi login tidak valid atau telah berakhir. Silakan login kembali.');
  }
  return response;
}

export async function publicSecurityHeaders(initial = {}) {
  const headers = new Headers(initial);
  if (appCheck) {
    const result = await getAppCheckToken(appCheck, false);
    if (result?.token) headers.set('X-Firebase-AppCheck', result.token);
  }
  return headers;
}
