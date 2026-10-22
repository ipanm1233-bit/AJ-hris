import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import {
  formatCoordinates,
  formatLocationTime,
  isValidLocation,
  locationMapUrl
} from "../js/geolocation.mjs";

const require = createRequire(import.meta.url);
const {
  buildProfileUpdate,
  calculateAge,
  employeeMatchesEmail,
  inferRoleFromEmployee,
  isEmployeeActive,
  normalizeLocation,
  profileFromEmployee,
  safeDocId
} = require("../lib/employee-profile.js");
const { _test: authGoogleTest } = require("../handlers/auth-google.js");
const { _test: authSessionTest } = require("../handlers/auth-session.js");
const { _test: accountTest } = require("../api/account.js");

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("Google login routes and client integration stay wired", () => {
  const server = source("../server.js");
  assert.match(server, /require\('\.\/api\/account\.js'\)/);
  assert.match(server, /app\.all\('\/api\/account'/);
  assert.match(server, /app\.all\('\/api\/auth-google'/);
  assert.match(server, /app\.all\('\/api\/auth-session'/);
  assert.match(server, /app\.all\('\/api\/profile-verify'/);
  assert.match(server, /app\.all\('\/api\/profile-update'/);
  assert.match(server, /app\.all\('\/api\/profile-location'/);
  assert.match(server, /app\.all\('\/api\/change-password'/);

  const loginView = source("../js/views/login.js");
  assert.match(loginView, /accounts\.google\.com\/gsi\/client/);
  assert.match(loginView, /loginWithGoogleCredential/);
  assert.match(loginView, /google-signin-button/);
  assert.match(loginView, /resolveGoogleClientId/);
  assert.match(loginView, /auth-google/);

  const auth = source("../js/auth.js");
  assert.match(auth, /\/api\/auth-google/);
  assert.match(auth, /profile_verification_required/);

  const app = source("../js/app.js");
  assert.match(app, /profile-verification\.js/);
  assert.match(app, /enforceProfileVerification/);

  const gate = source("../js/profile-verification.js");
  assert.match(gate, /\/api\/profile-verify/);
  assert.match(gate, /getCurrentLocation/);
  assert.match(gate, /profile_verification_required/);

  const profileHtml = source("../views/profile.html");
  assert.match(profileHtml, /btn-refresh-location/);
  assert.match(profileHtml, /profile-location-display/);

  const profileView = source("../js/views/profile.js");
  assert.match(profileView, /\/api\/profile-update/);
  assert.match(profileView, /Email login dikelola otomatis/);

  const envExample = source("../.env.example");
  assert.match(envExample, /GOOGLE_OAUTH_CLIENT_ID/);
});

test("account endpoints are bundled to stay within the Vercel Hobby function limit", () => {
  const apiFunctions = readdirSync(new URL("../api", import.meta.url))
    .filter(file => file.endsWith(".js"));
  assert.ok(apiFunctions.length <= 12, `Vercel Hobby hanya mendukung 12 functions, ditemukan ${apiFunctions.length}`);

  assert.equal(accountTest.resolveAction({ url: "/api/auth-google" }), "auth-google");
  assert.equal(accountTest.resolveAction({ url: "/api/auth-session" }), "auth-session");
  assert.equal(accountTest.resolveAction({ url: "/api/account?action=profile-verify" }), "profile-verify");
  assert.equal(accountTest.resolveAction({ url: "/api/account?action=profile-update" }), "profile-update");
  assert.equal(accountTest.resolveAction({ url: "/api/account?action=profile-location" }), "profile-location");
  assert.equal(accountTest.resolveAction({ url: "/api/account?action=change-password" }), "change-password");
  assert.equal(accountTest.resolveAction({ url: "/api/account?action=unknown" }), "");

  const vercel = JSON.parse(source("../vercel.json"));
  const rewrites = new Map(vercel.rewrites.map(rule => [rule.source, rule.destination]));
  assert.equal(rewrites.get("/api/auth-google"), "/api/account?action=auth-google");
  assert.equal(rewrites.get("/api/profile-verify"), "/api/account?action=profile-verify");
  assert.equal(rewrites.get("/api/profile-update"), "/api/account?action=profile-update");
  assert.equal(rewrites.get("/api/profile-location"), "/api/account?action=profile-location");
});

test("employee self-service profile update uses the validated server endpoint", () => {
  const endpoint = source("../handlers/profile-update.js");
  assert.match(endpoint, /buildProfileUpdate/);
  assert.match(endpoint, /EMPLOYEE_PROFILE_UPDATED/);
  assert.match(endpoint, /requireFirebaseAuth/);
  assert.doesNotMatch(endpoint, /assertAllowedKeys\([^)]*email/);
});

test("security blocks unlinked Google accounts and unfinished verification", () => {
  const security = source("../lib/security.js");
  assert.match(security, /ACCOUNT_NOT_LINKED/);
  assert.match(security, /PROFILE_VERIFICATION_REQUIRED/);
  assert.match(security, /linked: hasProfileIdentity \|\| hasClaimIdentity/);
  assert.match(security, /allowProfileVerificationRequired/);
});

test("Google auth verifies the ID token server-side before issuing a custom token", () => {
  const authGoogle = source("../handlers/auth-google.js");
  assert.match(authGoogle, /auth-google-config/);
  assert.match(authGoogle, /oauth2\.googleapis\.com\/tokeninfo/);
  assert.match(authGoogle, /payload\.aud/);
  assert.match(authGoogle, /email_verified/);
  assert.match(authGoogle, /setCustomUserClaims/);
  assert.match(authGoogle, /createCustomToken/);
  assert.match(authGoogle, /findEmployeeByEmail/);
  assert.match(authGoogle, /findUserForEmployee/);
  assert.match(authGoogle, /email: googleIdentity\.email/);
  assert.doesNotMatch(authGoogle, /signInWithPopup|GoogleAuthProvider/);
});

test("employee email matching supports legacy aliases and role inference", () => {
  assert.equal(employeeMatchesEmail({ email_perusahaan: "HRD@ANDELA.CO.ID" }, "hrd@andela.co.id"), true);
  assert.equal(employeeMatchesEmail({ email_google: "budi@gmail.com" }, "BUDI@gmail.com"), true);
  assert.equal(employeeMatchesEmail({ email: "lain@example.com" }, "budi@gmail.com"), false);

  assert.equal(inferRoleFromEmployee({ jabatan: "Kepala Cabang Cirebon" }), "BRANCH MANAGER");
  assert.equal(inferRoleFromEmployee({ jabatan: "Manager HRD" }), "HRD");
  assert.equal(inferRoleFromEmployee({ jabatan: "Staff Administrasi" }), "STAFF");
  assert.equal(inferRoleFromEmployee({ jabatan: "Supervisor Sales" }), "SPV");
});

test("employee active status handles common HR status variants", () => {
  assert.equal(isEmployeeActive({ aktif_tdk_aktif: "AKTIF" }), true);
  assert.equal(isEmployeeActive({ aktif_tdk_aktif: "TIDAK AKTIF" }), false);
  assert.equal(isEmployeeActive({ status_karyawan: "RESIGN" }), false);
  assert.equal(isEmployeeActive({ status_akun: "NONAKTIF" }), false);
});

test("profile normalization maps legacy fields into the verification form", () => {
  const profile = profileFromEmployee({
    id: "001",
    nik: "001",
    nama: "Budi Santoso",
    posisi: "Kepala Cabang",
    no_ktp: "3273123456789012",
    no_kartu_keluarga: "3273123456789999",
    no_bpjs_tk: "1234567890",
    no_hp: "0812-3456-7890",
    email_perusahaan: "BUDI@ANDELA.CO.ID",
    alamat: "Jl. Domisili No. 1",
    alamat_ktp: "Jl. Sesuai KTP No. 2"
  });
  assert.equal(profile.nik_karyawan, "001");
  assert.equal(profile.nama_karyawan, "Budi Santoso");
  assert.equal(profile.alamat, "Jl. Domisili No. 1");
  assert.equal(profile.alamat_domisili, "Jl. Domisili No. 1");
  assert.equal(profile.alamat_ktp, "Jl. Sesuai KTP No. 2");
  assert.equal(profile.nik_ktp, "3273123456789012");
  assert.equal(profile.no_kk, "3273123456789999");
  assert.equal(profile.bpjs_tk, "1234567890");
  assert.equal(profile.no_hp_aktif, "081234567890");
  assert.equal(profile.email, "budi@andela.co.id");
});

test("profile update validates NIK, phone, address, and writes alias fields", () => {
  const update = buildProfileUpdate({
    nik_ktp: "3273 1234 5678 9012",
    no_kk: "3273123456789999",
    no_hp_aktif: "0812-3456-7890",
    alamat: "Jl. Merdeka No. 1",
    tanggal_lahir: "1990-01-31",
    jenis_kelamin: "laki-laki",
    tanggungan: "2",
    npwp: "12.345.678.9-012.000",
    bpjs_tk: "123 456 7890"
  });
  assert.equal(update.nik_ktp, "3273123456789012");
  assert.equal(update.no_ktp, update.nik_ktp);
  assert.equal(update.no_kk, "3273123456789999");
  assert.equal(update.no_hp_aktif, "081234567890");
  assert.equal(update.jenis_kelamin, "LAKI-LAKI");
  assert.equal(update.tanggungan, 2);
  assert.equal(update.anak, 2);
  assert.equal(update.npwp, "123456789012000");
  assert.equal(update.no_bpjs_tk, "1234567890");
  assert.equal(update.bpjs_ketenagakerjaan, "1234567890");
  assert.ok(Number.isInteger(update.usia));

  const domisiliAlias = buildProfileUpdate({ no_hp_aktif: "081234567890", alamat_domisili: "Jl. Domisili Baru" });
  assert.equal(domisiliAlias.alamat, "Jl. Domisili Baru");
  assert.equal(domisiliAlias.alamat_domisili, "Jl. Domisili Baru");
  assert.equal(
    profileFromEmployee({ alamat: "Jl. Domisili", alamat_ktp: "" }).alamat_ktp,
    "",
    "Alamat KTP tidak boleh otomatis disamakan dengan alamat domisili"
  );

  assert.throws(() => buildProfileUpdate({ nik_ktp: "123" }), /16 digit/);
  assert.throws(() => buildProfileUpdate({ no_hp_aktif: "", alamat: "Jl. A" }), /HP aktif wajib/);
  assert.throws(() => buildProfileUpdate({ no_hp_aktif: "081234567890", alamat: "" }), /Alamat domisili wajib/);
  assert.throws(() => buildProfileUpdate({ email: "budi@gmail.com" }), /tidak diizinkan/);
  assert.equal(calculateAge("2000-01-01") > 20, true);
});

test("Form Cuti hanya memakai alamat domisili, bukan alamat KTP", () => {
  const utils = source("../js/utils.js");
  const cuti = source("../js/views/cuti.js");

  const formStart = utils.indexOf("export async function downloadFormCutiPdf");
  const formEnd = utils.indexOf("export async function generateAndSaveCutiDocument");
  assert.ok(formStart > -1 && formEnd > formStart, "Fungsi Form Cuti harus tersedia di utils.js");
  assert.doesNotMatch(utils.slice(formStart, formEnd), /alamat_ktp/);
  assert.match(utils.slice(formStart, formEnd), /alamat_domisili/);

  assert.match(cuti, /function leaveFormContact\(employee, data = \{\}, fallback = "-"\)/);
  assert.match(cuti, /const address = clean\(employee\?\.alamat\) \|\| clean\(employee\?\.alamat_domisili\)/);
  assert.match(cuti, /kontak: leaveFormContact\(k, row\)/);
  assert.match(cuti, /const kontakStr = leaveFormContact\(k, pdfData\)/);
  assert.match(cuti, /const kontakStr = leaveFormContact\(k, data\)/);
  assert.doesNotMatch(cuti, /alamat_ktp/);
});

test("location normalization rounds coordinates and rejects invalid points", () => {
  const location = normalizeLocation({
    latitude: -6.7320421234,
    longitude: 108.5521909876,
    accuracy: 12.7,
    captured_at: "2026-10-22T10:00:00.000Z"
  });
  assert.equal(location.latitude, -6.732042);
  assert.equal(location.longitude, 108.552191);
  assert.equal(location.accuracy, 13);
  assert.equal(location.source, "browser_geolocation");
  assert.throws(() => normalizeLocation({ latitude: 100, longitude: 0 }), /Latitude/);
  assert.throws(() => normalizeLocation({ latitude: 0, longitude: 200 }), /Longitude/);
  assert.equal(safeDocId("017/HRD#1"), "017_HRD_1");
});

test("client geolocation helpers validate and format a location", () => {
  assert.equal(isValidLocation({ latitude: -6.7, longitude: 108.5 }), true);
  assert.equal(isValidLocation({ latitude: "x", longitude: 108.5 }), false);
  assert.equal(formatCoordinates({ latitude: -6.732042, longitude: 108.552191 }), "-6.732042, 108.552191");
  assert.match(locationMapUrl({ latitude: -6.7, longitude: 108.5 }), /^https:\/\/www\.google\.com\/maps\?q=/);
  assert.notEqual(formatLocationTime("2026-10-22T10:00:00.000Z"), "-");
  const geolocation = source("../js/geolocation.mjs");
  assert.doesNotMatch(geolocation, /opencage|mapbox|googleapis\.com\/maps\/api/);
});

test("auth session exposes verification and location fields", () => {
  const profile = authSessionTest.sessionProfile({
    uid: "UID-1",
    username: "BUDI",
    name: "Budi",
    role: "STAFF",
    profile_verification_required: true,
    profile_verified_at: "2026-10-22T10:00:00.000Z",
    last_location: { latitude: -6.7, longitude: 108.5 }
  });
  assert.equal(profile.profile_verification_required, true);
  assert.equal(profile.profile_verified_at, "2026-10-22T10:00:00.000Z");
  assert.deepEqual(profile.last_location, { latitude: -6.7, longitude: 108.5 });
});

test("Google auth base profile keeps employee role, branch, and email", () => {
  const profile = authGoogleTest.buildBaseProfile(
    {
      id: "001",
      data: {
        nik_karyawan: "001",
        nama_karyawan: "Budi Santoso",
        jabatan: "Kepala Cabang Cirebon",
        cabang: "Cirebon",
        divisi: "Operasional",
        email: "budi@gmail.com"
      }
    },
    null,
    { email: "budi@gmail.com", name: "Budi", picture: "https://example.com/budi.jpg" }
  );
  assert.equal(profile.role, "BRANCH MANAGER");
  assert.equal(profile.cabang, "Cirebon");
  assert.equal(profile.email, "budi@gmail.com");
  assert.equal(profile.active, true);
  assert.equal(profile.must_change_password, false);
});
