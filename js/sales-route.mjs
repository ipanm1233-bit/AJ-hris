function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

export function applyDailyRouteOverride(departureConfig = {}, odometerRecord = {}, salesNik = "") {
  const basePoint = departureConfig.sales_points?.[salesNik] || {};
  const dailyPoint = {
    ...basePoint,
    ...(odometerRecord.start_gps ? {
      start_gps: odometerRecord.start_gps,
      start_nama: odometerRecord.start_nama || basePoint.start_nama || "Titik awal harian",
      start_type: odometerRecord.start_type || "CUSTOM HARIAN"
    } : {}),
    ...(odometerRecord.end_gps ? {
      end_gps: odometerRecord.end_gps,
      end_nama: odometerRecord.end_nama || basePoint.end_nama || "Titik akhir harian",
      end_type: odometerRecord.end_type || "CUSTOM HARIAN"
    } : {})
  };
  return {
    ...departureConfig,
    sales_points: {
      ...(departureConfig.sales_points || {}),
      [salesNik]: dailyPoint
    }
  };
}

export function calculateFuelClaim(distanceKm, { price = 10000, ratio = 25 } = {}) {
  const distance = Math.max(0, Number(distanceKm || 0));
  return Math.round(distance * (Number(price) / Number(ratio)));
}

export function buildDailyRouteReconciliation({ gpsKm = 0, odometerKm = 0, storeCount = 0 } = {}) {
  const gps = round1(gpsKm);
  const odometer = round1(odometerKm);
  return {
    storeCount: Number(storeCount || 0),
    gpsKm: gps,
    odometerKm: odometer,
    differenceKm: round1(odometer - gps),
    claimAmount: calculateFuelClaim(odometer)
  };
}
