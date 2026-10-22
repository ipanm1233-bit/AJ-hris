/**
 * Pembaca titik lokasi perangkat tanpa layanan berbayar.
 *
 * Browser Geolocation API bersifat gratis. Modul ini hanya menormalisasi hasil
 * pembacaan agar bentuk data yang dikirim ke server selalu konsisten.
 */

export function isValidLocation(location) {
  if (!location || typeof location !== "object") return false;
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  return Number.isFinite(latitude)
    && latitude >= -90
    && latitude <= 90
    && Number.isFinite(longitude)
    && longitude >= -180
    && longitude <= 180;
}

export function formatCoordinates(location) {
  if (!isValidLocation(location)) return "-";
  const latitude = Number(location.latitude).toFixed(6);
  const longitude = Number(location.longitude).toFixed(6);
  return `${latitude}, ${longitude}`;
}

export function formatAccuracy(location) {
  const accuracy = Number(location?.accuracy);
  return Number.isFinite(accuracy) && accuracy >= 0 ? `±${Math.round(accuracy)} m` : "-";
}

export function locationMapUrl(location) {
  if (!isValidLocation(location)) return "";
  return `https://www.google.com/maps?q=${encodeURIComponent(`${location.latitude},${location.longitude}`)}`;
}

export function formatLocationTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function geolocationErrorMessage(error) {
  const code = Number(error?.code);
  if (code === 1) {
    return "Izin lokasi ditolak. Aktifkan izin lokasi untuk HRAPP di pengaturan browser, lalu coba lagi.";
  }
  if (code === 2) {
    return "Titik lokasi tidak tersedia. Pastikan GPS/Wi-Fi aktif dan coba lagi.";
  }
  if (code === 3) {
    return "Pembacaan lokasi terlalu lama. Coba lagi di area dengan sinyal yang lebih baik.";
  }
  return "Gagal membaca titik lokasi perangkat. Silakan coba lagi.";
}

/**
 * @param {{ timeout?: number, enableHighAccuracy?: boolean }} [options]
 * @returns {Promise<{latitude:number,longitude:number,accuracy:number|null,altitude:number|null,altitude_accuracy:number|null,heading:number|null,speed:number|null,captured_at:string,source:string}>}
 */
export function getCurrentLocation(options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Perangkat/browser ini tidak mendukung pembacaan lokasi."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        const coords = position.coords || {};
        const latitude = Number(coords.latitude);
        const longitude = Number(coords.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          reject(new Error("Koordinat lokasi tidak valid."));
          return;
        }

        resolve({
          latitude,
          longitude,
          accuracy: Number.isFinite(Number(coords.accuracy)) ? Number(coords.accuracy) : null,
          altitude: Number.isFinite(Number(coords.altitude)) ? Number(coords.altitude) : null,
          altitude_accuracy: Number.isFinite(Number(coords.altitudeAccuracy)) ? Number(coords.altitudeAccuracy) : null,
          heading: Number.isFinite(Number(coords.heading)) ? Number(coords.heading) : null,
          speed: Number.isFinite(Number(coords.speed)) ? Number(coords.speed) : null,
          captured_at: new Date(Number(position.timestamp) || Date.now()).toISOString(),
          source: "browser_geolocation"
        });
      },
      error => reject(new Error(geolocationErrorMessage(error))),
      {
        enableHighAccuracy: options.enableHighAccuracy !== false,
        timeout: Number(options.timeout) > 0 ? Number(options.timeout) : 20_000,
        maximumAge: 0
      }
    );
  });
}
