/**
 * =====================================================================
 * UTILS.JS — Pustaka utilitas inti Portal HRIS CV Andela Jaya
 * Dipakai bersama oleh app.js, semua js/views/*.js, dan super-migrasi.html
 * =====================================================================
 */
import {
 db, COL, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc,
 deleteDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp,
 Timestamp
} from "./firebase-config.js";
// PERUBAHAN: lampiran file kini disimpan di Google Drive (lewat Apps Script
// Web App), bukan lagi Firebase Storage. Lihat js/gas-integration.js.
import { uploadFileToDrive } from "./gas-integration.js";
import { letterheadHtml, isoDocHeaderTable, COMPANY_NAME, logoImgTag } from "./branding.js";

// =========================================================================
// PLUS CODE (Open Location Code) DECODER -- diambil & diadaptasi dari
// implementasi resmi Google (github.com/google/open-location-code),
// lisensi Apache 2.0. Dipakai untuk mengonversi kode Plus Code (mis.
// "4GVJ+2JJ") yang muncul di kolom alamat export aplikasi Kanal jadi
// koordinat GPS presisi -- murni matematika, TIDAK butuh API/koneksi
// internet sama sekali.
// =========================================================================
const OpenLocationCode = (function() {
  var OpenLocationCode = {};

  /**
   * Provides a normal precision code, approximately 14x14 meters.
   * @const {number}
   */
  OpenLocationCode.CODE_PRECISION_NORMAL = 10;

  /**
   * Provides an extra precision code, approximately 2x3 meters.
   * @const {number}
   */
  OpenLocationCode.CODE_PRECISION_EXTRA = 11;

  // A separator used to break the code into two parts to aid memorability.
  var SEPARATOR_ = '+';

  // The number of characters to place before the separator.
  var SEPARATOR_POSITION_ = 8;

  // The character used to pad codes.
  var PADDING_CHARACTER_ = '0';

  // The character set used to encode the values.
  var CODE_ALPHABET_ = '23456789CFGHJMPQRVWX';

  // The base to use to convert numbers to/from.
  var ENCODING_BASE_ = CODE_ALPHABET_.length;

  // The maximum value for latitude in degrees.
  var LATITUDE_MAX_ = 90;

  // The maximum value for longitude in degrees.
  var LONGITUDE_MAX_ = 180;

  // The min number of digits in a Plus Code.
  var MIN_DIGIT_COUNT_ = 2;

  // The max number of digits to process in a Plus Code.
  var MAX_DIGIT_COUNT_ = 15;

  // Maximum code length using lat/lng pair encoding. The area of such a
  // code is approximately 13x13 meters (at the equator), and should be suitable
  // for identifying buildings. This excludes prefix and separator characters.
  var PAIR_CODE_LENGTH_ = 10;

  // First place value of the pairs (if the last pair value is 1).
  var PAIR_FIRST_PLACE_VALUE_ = Math.pow(
      ENCODING_BASE_, (PAIR_CODE_LENGTH_ / 2 - 1));

  // Inverse of the precision of the pair section of the code.
  var PAIR_PRECISION_ = Math.pow(ENCODING_BASE_, 3);

  // The resolution values in degrees for each position in the lat/lng pair
  // encoding. These give the place value of each position, and therefore the
  // dimensions of the resulting area.
  var PAIR_RESOLUTIONS_ = [20.0, 1.0, .05, .0025, .000125];

  // Number of digits in the grid precision part of the code.
  var GRID_CODE_LENGTH_ = MAX_DIGIT_COUNT_ - PAIR_CODE_LENGTH_;

  // Number of columns in the grid refinement method.
  var GRID_COLUMNS_ = 4;

  // Number of rows in the grid refinement method.
  var GRID_ROWS_ = 5;

  // First place value of the latitude grid (if the last place is 1).
  var GRID_LAT_FIRST_PLACE_VALUE_ = Math.pow(
      GRID_ROWS_, (GRID_CODE_LENGTH_ - 1));

  // First place value of the longitude grid (if the last place is 1).
  var GRID_LNG_FIRST_PLACE_VALUE_ = Math.pow(
      GRID_COLUMNS_, (GRID_CODE_LENGTH_ - 1));

  // Multiply latitude by this much to make it a multiple of the finest
  // precision.
  var FINAL_LAT_PRECISION_ = PAIR_PRECISION_ *
      Math.pow(GRID_ROWS_, (MAX_DIGIT_COUNT_ - PAIR_CODE_LENGTH_));

  // Multiply longitude by this much to make it a multiple of the finest
  // precision.
  var FINAL_LNG_PRECISION_ = PAIR_PRECISION_ *
      Math.pow(GRID_COLUMNS_, (MAX_DIGIT_COUNT_ - PAIR_CODE_LENGTH_));

  // Minimum length of a code that can be shortened.
  var MIN_TRIMMABLE_CODE_LEN_ = 6;

  /**
    @return {string} Returns the OLC alphabet.
   */
  OpenLocationCode.getAlphabet = function() {
    return CODE_ALPHABET_;
  };

  /**
   * Determines if a code is valid.
   *
   * To be valid, all characters must be from the Open Location Code character
   * set with at most one separator. The separator can be in any even-numbered
   * position up to the eighth digit.
   *
   * @param {string} code The string to check.
   * @return {boolean} True if the string is a valid code.
   */
  var isValid = OpenLocationCode.isValid = function(code) {
    if (!code || typeof code !== 'string') {
      return false;
    }
    // The separator is required.
    if (code.indexOf(SEPARATOR_) == -1) {
      return false;
    }
    if (code.indexOf(SEPARATOR_) != code.lastIndexOf(SEPARATOR_)) {
      return false;
    }
    // Is it the only character?
    if (code.length == 1) {
      return false;
    }
    // Is it in an illegal position?
    if (code.indexOf(SEPARATOR_) > SEPARATOR_POSITION_ ||
        code.indexOf(SEPARATOR_) % 2 == 1) {
      return false;
    }
    // We can have an even number of padding characters before the separator,
    // but then it must be the final character.
    if (code.indexOf(PADDING_CHARACTER_) > -1) {
      // Short codes cannot have padding
      if (code.indexOf(SEPARATOR_) < SEPARATOR_POSITION_) {
        return false;
      }
      // Not allowed to start with them!
      if (code.indexOf(PADDING_CHARACTER_) == 0) {
        return false;
      }
      // There can only be one group and it must have even length.
      var padMatch = code.match(new RegExp('(' + PADDING_CHARACTER_ + '+)', 'g'));
      if (padMatch.length > 1 || padMatch[0].length % 2 == 1 ||
          padMatch[0].length > SEPARATOR_POSITION_ - 2) {
        return false;
      }
      // If the code is long enough to end with a separator, make sure it does.
      if (code.charAt(code.length - 1) != SEPARATOR_) {
        return false;
      }
    }
    // If there are characters after the separator, make sure there isn't just
    // one of them (not legal).
    if (code.length - code.indexOf(SEPARATOR_) - 1 == 1) {
      return false;
    }

    // Strip the separator and any padding characters.
    code = code.replace(new RegExp('\\' + SEPARATOR_ + '+'), '')
        .replace(new RegExp(PADDING_CHARACTER_ + '+'), '');
    // Check the code contains only valid characters.
    for (var i = 0, len = code.length; i < len; i++) {
      var character = code.charAt(i).toUpperCase();
      if (character != SEPARATOR_ && CODE_ALPHABET_.indexOf(character) == -1) {
        return false;
      }
    }
    return true;
  };

  /**
   * Determines if a code is a valid short code.
   *
   * @param {string} code The string to check.
   * @return {boolean} True if the string can be produced by removing four or
   *     more characters from the start of a valid code.
   */
  var isShort = OpenLocationCode.isShort = function(code) {
    // Check it's valid.
    if (!isValid(code)) {
      return false;
    }
    // If there are less characters than expected before the SEPARATOR.
    if (code.indexOf(SEPARATOR_) >= 0 &&
        code.indexOf(SEPARATOR_) < SEPARATOR_POSITION_) {
      return true;
    }
    return false;
  };

  /**
   * Determines if a code is a valid full Open Location Code.
   *
   * @param {string} code The string to check.
   * @return {boolean} True if the code represents a valid latitude and
   *     longitude combination.
   */
  var isFull = OpenLocationCode.isFull = function(code) {
    if (!isValid(code)) {
      return false;
    }
    // If it's short, it's not full.
    if (isShort(code)) {
      return false;
    }

    // Work out what the first latitude character indicates for latitude.
    var firstLatValue = CODE_ALPHABET_.indexOf(
        code.charAt(0).toUpperCase()) * ENCODING_BASE_;
    if (firstLatValue >= LATITUDE_MAX_ * 2) {
      // The code would decode to a latitude of >= 90 degrees.
      return false;
    }
    if (code.length > 1) {
      // Work out what the first longitude character indicates for longitude.
      var firstLngValue = CODE_ALPHABET_.indexOf(
          code.charAt(1).toUpperCase()) * ENCODING_BASE_;
      if (firstLngValue >= LONGITUDE_MAX_ * 2) {
        // The code would decode to a longitude of >= 180 degrees.
        return false;
      }
    }
    return true;
  };

  /**
   * Encode a location into an Open Location Code.
   *
   * @param {number} latitude The latitude in signed decimal degrees. It will
   *     be clipped to the range -90 to 90.
   * @param {number} longitude The longitude in signed decimal degrees. Will be
   *     normalised to the range -180 to 180.
   * @param {?number} codeLength The length of the code to generate. If
   *     omitted, the value OpenLocationCode.CODE_PRECISION_NORMAL will be used.
   *     For a more precise result, OpenLocationCode.CODE_PRECISION_EXTRA is
   *     recommended.
   * @return {string} The code.
   * @throws {Exception} if any of the input values are not numbers.
   */
  var encode = OpenLocationCode.encode = function(latitude,
      longitude, codeLength) {
    latitude = Number(latitude);
    longitude = Number(longitude);

    const locationIntegers = locationToIntegers(latitude, longitude);

    return encodeIntegers(locationIntegers[0], locationIntegers[1], codeLength);
  };

  /**
   * Convert a latitude, longitude location into integer values.
   *
   * This function is only exposed for testing.
   *
   * Latitude is converted into a positive integer clipped into the range
   * 0 <= X < 180*2.5e7. (Latitude 90 needs to be adjusted to be slightly lower,
   * so that the returned code can also be decoded.
   * Longitude is converted into a positive integer and normalised into the range
   * 0 <= X < 360*8.192e6.

   * @param {number} latitude
   * @param {number} longitude
   * @return {Array<number>} A tuple of the latitude integer and longitude integer.
   */
  var locationToIntegers = OpenLocationCode.locationToIntegers = function(latitude, longitude) {
    var latVal = Math.floor(latitude * FINAL_LAT_PRECISION_);
    latVal += LATITUDE_MAX_ * FINAL_LAT_PRECISION_;
    if (latVal < 0) {
      latVal = 0;
    } else if (latVal >= 2 * LATITUDE_MAX_ * FINAL_LAT_PRECISION_) {
      latVal = 2 * LATITUDE_MAX_ * FINAL_LAT_PRECISION_ - 1;
    }
    var lngVal = Math.floor(longitude * FINAL_LNG_PRECISION_);
    lngVal += LONGITUDE_MAX_ * FINAL_LNG_PRECISION_;
    if (lngVal < 0) {
      lngVal =
        (lngVal % (2 * LONGITUDE_MAX_ * FINAL_LNG_PRECISION_)) +
        2 * LONGITUDE_MAX_ * FINAL_LNG_PRECISION_;
    } else if (lngVal >= 2 * LONGITUDE_MAX_ * FINAL_LNG_PRECISION_) {
      lngVal = lngVal % (2 * LONGITUDE_MAX_ * FINAL_LNG_PRECISION_);
    }
    return [latVal, lngVal];
  };

  /**
   * Encode a location that uses integer values into an Open Location Code.
   *
   * This is a testing function, and should not be called directly.
   *
   * @param {number} latInt An integer latitude.
   * @param {number} lngInt An integer longitude.
   * @param {number=} codeLength The number of significant digits in the output
   *     code, not including any separator characters.
   * @return {string} A code of the specified length or the default length if not
   *     specified.
   * @throws {Exception} if any of the input values are not numbers.
   */
  var encodeIntegers = OpenLocationCode.encodeIntegers = function(latInt, lngInt, codeLength) {
    if (typeof codeLength == 'undefined') {
      codeLength = OpenLocationCode.CODE_PRECISION_NORMAL;
    } else {
      codeLength = Math.min(MAX_DIGIT_COUNT_, Number(codeLength));
    }
    if (isNaN(latInt) || isNaN(lngInt) || isNaN(codeLength)) {
      throw new Error('ValueError: Parameters are not numbers');
    }
    if (codeLength < MIN_DIGIT_COUNT_ ||
        (codeLength < PAIR_CODE_LENGTH_ && codeLength % 2 == 1)) {
      throw new Error('IllegalArgumentException: Invalid Open Location Code length');
    }
    // Javascript strings are immutable and it doesn't have a native
    // StringBuilder, so we'll use an array.
    const code = new Array(MAX_DIGIT_COUNT_ + 1);
    code[SEPARATOR_POSITION_] = SEPARATOR_;

    // Compute the grid part of the code if necessary.
    if (codeLength > PAIR_CODE_LENGTH_) {
      for (var i = MAX_DIGIT_COUNT_ - PAIR_CODE_LENGTH_; i >= 1; i--) {
        var latDigit = latInt % GRID_ROWS_;
        var lngDigit = lngInt % GRID_COLUMNS_;
        var ndx = latDigit * GRID_COLUMNS_ + lngDigit;
        code[SEPARATOR_POSITION_ + 2 + i] = CODE_ALPHABET_.charAt(ndx);
        // Note! Integer division.
        latInt = Math.floor(latInt / GRID_ROWS_);
        lngInt = Math.floor(lngInt / GRID_COLUMNS_);
      }
    } else {
      latInt = Math.floor(latInt / Math.pow(GRID_ROWS_, GRID_CODE_LENGTH_));
      lngInt = Math.floor(lngInt / Math.pow(GRID_COLUMNS_, GRID_CODE_LENGTH_));
    }

    // Add the pair after the separator.
    code[SEPARATOR_POSITION_ + 1] = CODE_ALPHABET_.charAt(latInt % ENCODING_BASE_);
    code[SEPARATOR_POSITION_ + 2] = CODE_ALPHABET_.charAt(lngInt % ENCODING_BASE_);
    latInt = Math.floor(latInt / ENCODING_BASE_);
    lngInt = Math.floor(lngInt / ENCODING_BASE_);

    // Compute the pair section of the code.
    for (var i = PAIR_CODE_LENGTH_ / 2 + 1; i >= 0; i -= 2) {
      code[i] = CODE_ALPHABET_.charAt(latInt % ENCODING_BASE_);
      code[i + 1] = CODE_ALPHABET_.charAt(lngInt % ENCODING_BASE_);
      latInt = Math.floor(latInt / ENCODING_BASE_);
      lngInt = Math.floor(lngInt / ENCODING_BASE_);
    }

    // If we don't need to pad the code, return the requested section.
    if (codeLength >= SEPARATOR_POSITION_) {
      return code.slice(0, codeLength + 1).join('');
    }
    // Pad and return the code.
    return code.slice(0, codeLength).join('') +
        Array(SEPARATOR_POSITION_ - codeLength + 1).join(PADDING_CHARACTER_) + SEPARATOR_;
  };

  /**
   * Decodes an Open Location Code into its location coordinates.
   *
   * Returns a CodeArea object that includes the coordinates of the bounding
   * box - the lower left, center and upper right.
   *
   * @param {string} code The code to decode.
   * @return {OpenLocationCode.CodeArea} An object with the coordinates of the
   *     area of the code.
   * @throws {Exception} If the code is not valid.
   */
  var decode = OpenLocationCode.decode = function(code) {
    // This calculates the values for the pair and grid section separately, using
    // integer arithmetic. Only at the final step are they converted to floating
    // point and combined.
    if (!isFull(code)) {
      throw new Error('IllegalArgumentException: ' +
          'Passed Plus Code is not a valid full code: ' + code);
    }
    // Strip the '+' and '0' characters from the code and convert to upper case.
    code = code.replace('+', '').replace(/0/g, '').toLocaleUpperCase('en-US');

    // Initialise the values for each section. We work them out as integers and
    // convert them to floats at the end.
    var normalLat = -LATITUDE_MAX_ * PAIR_PRECISION_;
    var normalLng = -LONGITUDE_MAX_ * PAIR_PRECISION_;
    var gridLat = 0;
    var gridLng = 0;
    // How many digits do we have to process?
    var digits = Math.min(code.length, PAIR_CODE_LENGTH_);
    // Define the place value for the most significant pair.
    var pv = PAIR_FIRST_PLACE_VALUE_;
    // Decode the paired digits.
    for (var i = 0; i < digits; i += 2) {
      normalLat += CODE_ALPHABET_.indexOf(code.charAt(i)) * pv;
      normalLng += CODE_ALPHABET_.indexOf(code.charAt(i + 1)) * pv;
      if (i < digits - 2) {
        pv /= ENCODING_BASE_;
      }
    }
    // Convert the place value to a float in degrees.
    var latPrecision = pv / PAIR_PRECISION_;
    var lngPrecision = pv / PAIR_PRECISION_;
    // Process any extra precision digits.
    if (code.length > PAIR_CODE_LENGTH_) {
      // Initialise the place values for the grid.
      var rowpv = GRID_LAT_FIRST_PLACE_VALUE_;
      var colpv = GRID_LNG_FIRST_PLACE_VALUE_;
      // How many digits do we have to process?
      digits = Math.min(code.length, MAX_DIGIT_COUNT_);
      for (var i = PAIR_CODE_LENGTH_; i < digits; i++) {
        var digitVal = CODE_ALPHABET_.indexOf(code.charAt(i));
        var row = Math.floor(digitVal / GRID_COLUMNS_);
        var col = digitVal % GRID_COLUMNS_;
        gridLat += row * rowpv;
        gridLng += col * colpv;
        if (i < digits - 1) {
          rowpv /= GRID_ROWS_;
          colpv /= GRID_COLUMNS_;
        }
      }
      // Adjust the precisions from the integer values to degrees.
      latPrecision = rowpv / FINAL_LAT_PRECISION_;
      lngPrecision = colpv / FINAL_LNG_PRECISION_;
    }
    // Merge the values from the normal and extra precision parts of the code.
    var lat = normalLat / PAIR_PRECISION_ + gridLat / FINAL_LAT_PRECISION_;
    var lng = normalLng / PAIR_PRECISION_ + gridLng / FINAL_LNG_PRECISION_;
    return new CodeArea(
        lat,
        lng,
        lat + latPrecision,
        lng + lngPrecision,
        Math.min(code.length, MAX_DIGIT_COUNT_));
  };

  /**
   * Recover the nearest matching code to a specified location.
   *
   * Given a valid short Open Location Code this recovers the nearest matching
   * full code to the specified location.
   *
   * @param {string} shortCode A valid short code.
   * @param {number} referenceLatitude The latitude to use for the reference
   *     location.
   * @param {number} referenceLongitude The longitude to use for the reference
   *     location.
   * @return {string} The nearest matching full code to the reference location.
   * @throws {Exception} if the short code is not valid, or the reference
   *     position values are not numbers.
   */
  OpenLocationCode.recoverNearest = function(
      shortCode, referenceLatitude, referenceLongitude) {
    if (!isShort(shortCode)) {
      if (isFull(shortCode)) {
        return shortCode.toUpperCase();
      } else {
        throw new Error(
            'ValueError: Passed short code is not valid: ' + shortCode);
      }
    }
    referenceLatitude = Number(referenceLatitude);
    referenceLongitude = Number(referenceLongitude);
    if (isNaN(referenceLatitude) || isNaN(referenceLongitude)) {
      throw new Error('ValueError: Reference position are not numbers');
    }
    // Ensure that latitude and longitude are valid.
    referenceLatitude = clipLatitude(referenceLatitude);
    referenceLongitude = normalizeLongitude(referenceLongitude);

    // Clean up the passed code.
    shortCode = shortCode.toUpperCase();
    // Compute the number of digits we need to recover.
    var paddingLength = SEPARATOR_POSITION_ - shortCode.indexOf(SEPARATOR_);
    // The resolution (height and width) of the padded area in degrees.
    var resolution = Math.pow(20, 2 - (paddingLength / 2));
    // Distance from the center to an edge (in degrees).
    var halfResolution = resolution / 2.0;

    // Use the reference location to pad the supplied short code and decode it.
    var codeArea = decode(
        encode(referenceLatitude, referenceLongitude).substr(0, paddingLength)
        + shortCode);
    // How many degrees latitude is the code from the reference? If it is more
    // than half the resolution, we need to move it north or south but keep it
    // within -90 to 90 degrees.
    if (referenceLatitude + halfResolution < codeArea.latitudeCenter &&
        codeArea.latitudeCenter - resolution >= -LATITUDE_MAX_) {
      // If the proposed code is more than half a cell north of the reference location,
      // it's too far, and the best match will be one cell south.
      codeArea.latitudeCenter -= resolution;
    } else if (referenceLatitude - halfResolution > codeArea.latitudeCenter &&
               codeArea.latitudeCenter + resolution <= LATITUDE_MAX_) {
      // If the proposed code is more than half a cell south of the reference location,
      // it's too far, and the best match will be one cell north.
      codeArea.latitudeCenter += resolution;
    }

    // How many degrees longitude is the code from the reference?
    if (referenceLongitude + halfResolution < codeArea.longitudeCenter) {
      codeArea.longitudeCenter -= resolution;
    } else if (referenceLongitude - halfResolution > codeArea.longitudeCenter) {
      codeArea.longitudeCenter += resolution;
    }

    return encode(
        codeArea.latitudeCenter, codeArea.longitudeCenter, codeArea.codeLength);
  };

  /**
   * Remove characters from the start of an OLC code.
   *
   * This uses a reference location to determine how many initial characters
   * can be removed from the OLC code. The number of characters that can be
   * removed depends on the distance between the code center and the reference
   * location.
   *
   * @param {string} code The full code to shorten.
   * @param {number} latitude The latitude to use for the reference location.
   * @param {number} longitude The longitude to use for the reference location.
   * @return {string} The code, shortened as much as possible that it is still
   *     the closest matching code to the reference location.
   * @throws {Exception} if the passed code is not a valid full code or the
   *     reference location values are not numbers.
   */
  OpenLocationCode.shorten = function(
      code, latitude, longitude) {
    if (!isFull(code)) {
      throw new Error('ValueError: Passed code is not valid and full: ' + code);
    }
    if (code.indexOf(PADDING_CHARACTER_) != -1) {
      throw new Error('ValueError: Cannot shorten padded codes: ' + code);
    }
    code = code.toUpperCase();
    var codeArea = decode(code);
    if (codeArea.codeLength < MIN_TRIMMABLE_CODE_LEN_) {
      throw new Error(
          'ValueError: Code length must be at least ' +
          MIN_TRIMMABLE_CODE_LEN_);
    }
    // Ensure that latitude and longitude are valid.
    latitude = Number(latitude);
    longitude = Number(longitude);
    if (isNaN(latitude) || isNaN(longitude)) {
      throw new Error('ValueError: Reference position are not numbers');
    }
    latitude = clipLatitude(latitude);
    longitude = normalizeLongitude(longitude);
    // How close are the latitude and longitude to the code center.
    var range = Math.max(
        Math.abs(codeArea.latitudeCenter - latitude),
        Math.abs(codeArea.longitudeCenter - longitude));
    for (var i = PAIR_RESOLUTIONS_.length - 2; i >= 1; i--) {
      // Check if we're close enough to shorten. The range must be less than 1/2
      // the resolution to shorten at all, and we want to allow some safety, so
      // use 0.3 instead of 0.5 as a multiplier.
      if (range < (PAIR_RESOLUTIONS_[i] * 0.3)) {
        // Trim it.
        return code.substring((i + 1) * 2);
      }
    }
    return code;
  };

  /**
   * Clip a latitude into the range -90 to 90.
   *
   * @param {number} latitude
   * @return {number} The latitude value clipped to be in the range.
   */
  var clipLatitude = function(latitude) {
    return Math.min(90, Math.max(-90, latitude));
  };

  /**
   * Normalize a longitude into the range -180 to 180, not including 180.
   *
   * @param {number} longitude
   * @return {number} Normalized into the range -180 to 180.
   */
  var normalizeLongitude = function(longitude) {
    while (longitude < -180) {
      longitude = longitude + 360;
    }
    while (longitude >= 180) {
      longitude = longitude - 360;
    }
    return longitude;
  };

  /**
   * Coordinates of a decoded Open Location Code.
   *
   * The coordinates include the latitude and longitude of the lower left and
   * upper right corners and the center of the bounding box for the area the
   * code represents.
   * @param {number} latitudeLo
   * @param {number} longitudeLo
   * @param {number} latitudeHi
   * @param {number} longitudeHi
   * @param {number} codeLength
   *
   * @constructor
   */
  var CodeArea = OpenLocationCode.CodeArea = function(
      latitudeLo, longitudeLo, latitudeHi, longitudeHi, codeLength) {
    return new OpenLocationCode.CodeArea.fn.Init(
        latitudeLo, longitudeLo, latitudeHi, longitudeHi, codeLength);
  };
  CodeArea.fn = CodeArea.prototype = {
    Init: function(
        latitudeLo, longitudeLo, latitudeHi, longitudeHi, codeLength) {
      /**
       * The latitude of the SW corner.
       * @type {number}
       */
      this.latitudeLo = latitudeLo;
      /**
       * The longitude of the SW corner in degrees.
       * @type {number}
       */
      this.longitudeLo = longitudeLo;
      /**
       * The latitude of the NE corner in degrees.
       * @type {number}
       */
      this.latitudeHi = latitudeHi;
      /**
       * The longitude of the NE corner in degrees.
       * @type {number}
       */
      this.longitudeHi = longitudeHi;
      /**
       * The number of digits in the code.
       * @type {number}
       */
      this.codeLength = codeLength;
      /**
       * The latitude of the center in degrees.
       * @type {number}
       */
      this.latitudeCenter = Math.min(
          latitudeLo + (latitudeHi - latitudeLo) / 2, LATITUDE_MAX_);
      /**
       * The longitude of the center in degrees.
       * @type {number}
       */
      this.longitudeCenter = Math.min(
          longitudeLo + (longitudeHi - longitudeLo) / 2, LONGITUDE_MAX_);
    },
  };
  CodeArea.fn.Init.prototype = CodeArea.fn;

  return OpenLocationCode;
})();


/* ---------------------------------------------------------------------
 * 1. SMART DATE PARSER
 * Menangani 3 kemungkinan bentuk tanggal yang lazim ditemui saat migrasi
 * dari Excel/Google Sheets ke Firestore:
 * a) Excel Serial Date (angka, mis. 45825) -> dihitung dari epoch Excel 1899-12-30
 * b) String format Indonesia "DD/MM/YYYY" atau "DD-MM-YYYY"
 * c) String ISO "YYYY-MM-DDTHH:mm:ss.sssZ" (dari Date_Pengajuan, dsb)
 * Prinsip: SELALU baca hari terlebih dahulu (DD) bukan bulan (MM) agar
 * tidak terjadi "US Date Confusion" (01/11/2023 => 1 November, BUKAN 11 Januari).
 * ------------------------------------------------------------------- */
export function smartParseDate(value) {
 if (value === null || value === undefined || value === "" || value === "#N/A") return null;

 // Sudah berupa objek Date valid
 if (value instanceof Date && !isNaN(value.getTime())) return value;

 // Firestore Timestamp
 if (value && typeof value.toDate === "function") return value.toDate();

 // Excel Serial Date (angka). Excel epoch = 1899-12-30 (mengkompensasi bug leap-year 1900 Lotus)
 if (typeof value === "number" && isFinite(value)) {
 if (value > 20000 && value < 80000) { // rentang wajar tahun ~1954-2119
 const excelEpoch = new Date(Date.UTC(1899, 11, 30));
 const ms = value * 24 * 60 * 60 * 1000;
 return new Date(excelEpoch.getTime() + ms);
 }
 return null;
 }

 if (typeof value === "string") {
 const s = value.trim();
 if (!s || s === "#N/A" || s === "-") return null;

 // Angka serial dalam bentuk string
 if (/^\d+(\.\d+)?$/.test(s)) {
 return smartParseDate(parseFloat(s));
 }

 // ISO 8601: 2026-06-26T04:45:32.971Z atau 2026-06-26
 const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})(T.*)?$/);
 if (isoMatch) {
 const d = new Date(s);
 if (!isNaN(d.getTime())) return d;
 }

 // Format Indonesia: DD/MM/YYYY atau DD-MM-YYYY (WAJIB baca hari dulu!)
 const idMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
 if (idMatch) {
 let [, dd, mm, yyyy] = idMatch;
 dd = parseInt(dd, 10); mm = parseInt(mm, 10); yyyy = parseInt(yyyy, 10);
 if (yyyy < 100) yyyy += 2000;
 if (mm > 12) { const t = mm; mm = dd; dd = t; } // fallback jika salah satu > 12 berarti itu pasti hari
 const d = new Date(Date.UTC(yyyy, mm - 1, dd));
 if (!isNaN(d.getTime())) return d;
 }

 // Terakhir, coba native parser (hati-hati bias US, hanya fallback)
 const fallback = new Date(s);
 if (!isNaN(fallback.getTime())) return fallback;
 }

 return null;
}

/* ---------------------------------------------------------------------
 * 2. FORMATTER TAMPILAN (locale Indonesia)
 * PERBAIKAN PENTING: seluruh formatter di bawah sekarang memaksa
 * `timeZone: "Asia/Jakarta"` secara eksplisit. Sebelumnya tidak
 * di-set, jadi hasilnya ikut zona waktu SISTEM PERANGKAT yang membuka
 * aplikasi ini. Kalau timezone perangkat itu bukan WIB (banyak laptop
 * kantor dibiarkan default UTC/zona lain oleh IT), tanggal yang tampil
 * bisa maju/mundur 1 hari dari yang seharusnya -- ini penyebab bug
 * "ulang tahun karyawan tampil H-1" & "cuti besok muncul di Cuti Hari
 * Ini". Dengan timeZone eksplisit, hasilnya SELALU benar sesuai WIB,
 * apa pun timezone perangkat yang dipakai membuka aplikasinya.
 * ------------------------------------------------------------------- */
export function fmtDate(value, opts = {}) {
 const d = smartParseDate(value);
 if (!d) return "-";
 return d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta", ...opts });
}
export function fmtDateShort(value) {
 const d = smartParseDate(value);
 if (!d) return "-";
 return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Jakarta" });
}
export function fmtDateTime(value) {
 const d = smartParseDate(value);
 if (!d) return "-";
 return d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}
export function fmtRupiah(value) {
 const n = toNumber(value);
 return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}
export function toNumber(value) {
 if (value === null || value === undefined || value === "" || value === "#N/A") return 0;
 if (typeof value === "number") return value;
 const cleaned = String(value).replace(/[^\d\-,.]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".");
 const n = parseFloat(cleaned);
 return isNaN(n) ? 0 : n;
}
export function daysBetween(a, b) {
 const da = smartParseDate(a), db_ = smartParseDate(b);
 if (!da || !db_) return null;
 return Math.round((db_.setHours(0,0,0,0) - da.setHours(0,0,0,0)) / 86400000);
}
export function calculateAge(value) {
 if (!value) return null;
 const d = smartParseDate(value);
 if (!d || isNaN(d.getTime())) return null;
 const today = new Date();
 let age = today.getFullYear() - d.getFullYear();
 const m = today.getMonth() - d.getMonth();
 if (m < 0 || (m === 0 && today.getDate() < d.getDate())) {
 age--;
 }
 return age >= 0 ? age : null;
}
export function calculateTenure(value) {
 if (!value) return "-";
 const d = smartParseDate(value);
 if (!d || isNaN(d.getTime())) return String(value);
 const today = new Date();
 let years = today.getFullYear() - d.getFullYear();
 let months = today.getMonth() - d.getMonth();
 if (months < 0 || (months === 0 && today.getDate() < d.getDate())) {
 years--;
 months += 12;
 }
 if (today.getDate() < d.getDate()) {
 months--;
 if (months < 0) {
 years--;
 months += 12;
 }
 }
 if (years <= 0 && months <= 0) return "< 1 Bulan";
 let parts = [];
 if (years > 0) parts.push(`${years} Tahun`);
 if (months > 0) parts.push(`${months} Bulan`);
 return parts.join(" ") || "< 1 Bulan";
}
export function toSnakeCase(str) {
 return String(str)
 .trim()
 .replace(/[^\w\s/]/g, "")
 .replace(/\s+/g, "_")
 .replace(/__+/g, "_")
 .toLowerCase();
}
export function genId(prefix = "ID") {
 return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}
export function initials(name = "") {
 return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}
export async function sha256(text) {
 const enc = new TextEncoder().encode(text);
 const buf = await crypto.subtle.digest("SHA-256", enc);
 return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ---------------------------------------------------------------------
 * 3. TOAST NOTIFICATION
 * ------------------------------------------------------------------- */
export function toast(message, type = "info") {
 const host = document.getElementById("toast-host");
 if (!host) { console.log(`[toast:${type}]`, message); return; }
 const colors = {
 success: "bg-emerald-600",
 error: "bg-red-700",
 info: "bg-slate-800",
 warning: "bg-amber-600"
 };
 const el = document.createElement("div");
 el.className = `${colors[type] || colors.info} text-white text-sm px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 opacity-0 translate-x-4 transition-all duration-300`;
 el.innerHTML = `<span>${message}</span>`;
 host.appendChild(el);
 requestAnimationFrame(() => {
 el.classList.remove("opacity-0", "translate-x-4");
 });
 setTimeout(() => {
 el.classList.add("opacity-0", "translate-x-4");
 setTimeout(() => el.remove(), 300);
 }, 3500);
}

/* ---------------------------------------------------------------------
 * 4. MODAL SYSTEM — generik, dipakai semua modul
 * ------------------------------------------------------------------- */
export function openModal(options, bodyArg = "", extraArg = {}) {
  closeModal();
  let title = "Informasi Detail";
  let modalBody = "";
  let footerHtml = "";
  let size = "md";
  let onMount = null;

  if (typeof options === "string" && (bodyArg || typeof bodyArg === "string")) {
    // Signature: openModal(title, bodyHtml, optionsObj)
    title = options;
    modalBody = bodyArg;
    if (extraArg && typeof extraArg === "object") {
      footerHtml = extraArg.footerHtml || "";
      size = extraArg.size || "md";
      onMount = extraArg.onMount || null;
    }
  } else if (typeof options === "string") {
    modalBody = options;
  } else if (options && typeof options === "object") {
    title = options.title || "Informasi Detail";
    modalBody = options.bodyHtml || options.contentHtml || options.content || options.body || "";
    footerHtml = options.footerHtml || "";
    size = options.size || "md";
    onMount = options.onMount || null;
  }

  // Remove existing backdrops if any to avoid DOM stacking collisions
  const existingBackdrops = document.querySelectorAll("#app-modal-backdrop");
  existingBackdrops.forEach(b => b.remove());

  const sizes = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl", xl: "max-w-6xl", "7xl": "max-w-7xl", full: "max-w-[96vw] w-full" };
  const sizeClass = sizes[size] || (typeof size === "string" && size.startsWith("max-w-") ? size : sizes.md);
  const backdrop = document.createElement("div");
  backdrop.id = "app-modal-backdrop";
  backdrop.className = "fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 opacity-0 transition-opacity duration-200";
  backdrop.innerHTML = `
  <div class="bg-white w-full ${sizeClass} rounded-2xl shadow-2xl max-h-[90vh] flex flex-col scale-95 transition-transform duration-200" id="app-modal-panel">
  <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
  <h3 class="text-lg font-semibold text-slate-800">${title}</h3>
  <button id="app-modal-close" class="text-slate-400 hover:text-maroon-700 hover:bg-slate-100 rounded-lg w-8 h-8 flex items-center justify-center transition cursor-pointer">
  <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
  </button>
  </div>
  <div class="px-6 py-5 overflow-y-auto flex-1">${modalBody}</div>
  ${footerHtml ? `<div class="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">${footerHtml}</div>` : ""}
  </div>`;
  document.body.appendChild(backdrop);
  document.body.classList.add("overflow-hidden");
  requestAnimationFrame(() => {
    backdrop.classList.remove("opacity-0");
    const panel = backdrop.querySelector("#app-modal-panel");
    if (panel) panel.classList.remove("scale-95");
  });
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
  backdrop.querySelector("#app-modal-close").addEventListener("click", closeModal);
  if (onMount) onMount(backdrop);
  return backdrop;
}
export function closeModal() {
  const backdrops = document.querySelectorAll("#app-modal-backdrop");
  if (!backdrops.length) return;
  backdrops.forEach(el => {
    el.classList.add("opacity-0");
    setTimeout(() => el.remove(), 200);
  });
  document.body.classList.remove("overflow-hidden");
}
if (typeof window !== "undefined") {
 window.openModal = openModal;
 window.closeModal = closeModal;
}

export function formatStatusKaryawan(val) {
 if (!val) return "-";
 const str = String(val).toUpperCase().trim();
 if (str === "PKWTT" || str === "TETAP" || str.includes("TETAP")) return "PKWTT (Karyawan Tetap)";
 if (str === "PKWT" || str === "KONTRAK" || str.includes("KONTRAK")) return "PKWT (Karyawan Kontrak)";
 if (str === "PROBATION" || str.includes("PROBATION") || str.includes("PERCOBAAN")) return "Probation (Masa Percobaan)";
 if (str === "MAGANG" || str.includes("MAGANG")) return "Magang";
 if (str === "BURUH HARIAN" || str.includes("BURUH") || str.includes("HARIAN")) return "Buruh Harian";
 if (str === "OUTSOURCING" || str.includes("OUTSOURCING")) return "Outsourcing";
 if (str === "LAINNYA" || str.includes("LAIN")) return "Lainnya";
 return val;
}
export function confirmDialog(message, { title = "Konfirmasi", danger = true } = {}) {
 return new Promise((resolve) => {
 openModal({
 title,
 bodyHtml: `<div class="text-slate-600 text-sm leading-relaxed whitespace-pre-line">${escapeHtml(message)}</div>`,
 footerHtml: `
 <button id="cf-no" class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition">Batal</button>
 <button id="cf-yes" class="px-4 py-2 rounded-lg text-sm font-medium text-white ${danger ? "bg-red-700 hover:bg-red-800" : "bg-maroon-700 hover:bg-maroon-800"} transition">Ya, Lanjutkan</button>`,
 onMount: (m) => {
 m.querySelector("#cf-no").onclick = () => { closeModal(); resolve(false); };
 m.querySelector("#cf-yes").onclick = () => { closeModal(); resolve(true); };
 }
 });
 });
}

export function promptDialog(message, defaultValue = "", { title = "Input Data", inputType = "text", placeholder = "" } = {}) {
 return new Promise((resolve) => {
 openModal({
 title,
 bodyHtml: `
 <div class="space-y-3">
 <p class="text-slate-600 text-sm leading-relaxed whitespace-pre-line">${escapeHtml(message)}</p>
 <input type="${inputType}" id="pd-input" value="${escapeHtml(defaultValue)}" placeholder="${escapeHtml(placeholder)}" class="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:border-maroon-600 bg-white shadow-2xs font-medium" />
 </div>
 `,
 footerHtml: `
 <button id="pd-no" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer">Batal</button>
 <button id="pd-yes" class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-maroon-700 hover:bg-maroon-800 transition cursor-pointer">Simpan / Lanjutkan</button>
 `,
 onMount: (m) => {
 const inp = m.querySelector("#pd-input");
 if (inp) {
 setTimeout(() => { inp.focus(); inp.select(); }, 100);
 inp.onkeydown = (e) => {
 if (e.key === "Enter") {
 const val = inp.value;
 closeModal();
 resolve(val);
 }
 };
 }
 m.querySelector("#pd-no").onclick = () => { closeModal(); resolve(null); };
 m.querySelector("#pd-yes").onclick = () => {
 const val = inp ? inp.value : "";
 closeModal();
 resolve(val);
 };
 }
 });
 });
}

/* ---------------------------------------------------------------------
 * 5. FIRESTORE CRUD WRAPPER — dipakai renderCrudModule & views custom
 * ------------------------------------------------------------------- */
export async function fsGetAll(colName, { orderByField = null, direction = "asc" } = {}) {
 const ref = collection(db, colName);
 const q = orderByField ? query(ref, orderBy(orderByField, direction)) : ref;
 const snap = await getDocs(q);
 return snap.docs.map(d => ({ ...d.data(), id: d.id, _docId: d.id }));
}
export function fsListen(colName, callback, { orderByField = null, direction = "asc" } = {}) {
 const ref = collection(db, colName);
 const q = orderByField ? query(ref, orderBy(orderByField, direction)) : ref;
 return onSnapshot(q, (snap) => {
 callback(snap.docs.map(d => ({ ...d.data(), id: d.id, _docId: d.id })));
 }, (err) => console.error(`onSnapshot(${colName})`, err));
}
export function cleanFirestorePayload(obj, seen = new WeakSet()) {
 if (obj === null || obj === undefined) return null;
 if (typeof obj !== "object") return obj;
 if (obj instanceof Date) return obj;
 if (obj._methodName || (obj.constructor && obj.constructor.name === "FieldValue")) return obj;

 if (
 (typeof Node !== 'undefined' && obj instanceof Node) ||
 (typeof Event !== 'undefined' && obj instanceof Event) ||
 typeof obj === "function" ||
 (obj.constructor && (
 obj.constructor.name === "Y" ||
 obj.constructor.name === "Ka" ||
 obj.constructor.name === "DocumentReference" ||
 obj.constructor.name === "Query" ||
 obj.constructor.name === "Firestore" ||
 obj.constructor.name.startsWith("HTML")
 ))
 ) {
 return null;
 }

 if (seen.has(obj)) {
 return null;
 }
 seen.add(obj);

 if (Array.isArray(obj)) {
 return obj.map(item => cleanFirestorePayload(item, seen)).filter(item => item !== undefined);
 }

 const result = {};
 for (const key of Object.keys(obj)) {
 if (key.startsWith("_") && key !== "_methodName") continue;

 let cleanKey = key;
 if (/[\/~*\[\]]/.test(key)) {
   if (key === "aktif/tidak_aktif") {
     cleanKey = "aktif_tdk_aktif";
   } else {
     cleanKey = key.replace(/[\/~*\[\]]/g, "_");
   }
 }

 const val = obj[key];
 if (val === undefined || typeof val === "function") continue;
 const cleaned = cleanFirestorePayload(val, seen);
 if (cleaned !== undefined) {
   if (result[cleanKey] !== undefined && (cleaned === "" || cleaned === null)) continue;
   result[cleanKey] = cleaned;
 }
 }
 return result;
}

export async function fsGet(colName, id) {
 const snap = await getDoc(doc(db, colName, id));
 return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
export async function fsAdd(colName, data, customId = null) {
 const payload = cleanFirestorePayload(data) || {};
 if (customId) {
 await setDoc(doc(db, colName, String(customId)), { ...payload, created_at: serverTimestamp() });
 return customId;
 }
 const ref = await addDoc(collection(db, colName), { ...payload, created_at: serverTimestamp() });
 return ref.id;
}
export async function fsUpdate(colName, id, data) {
 const payload = cleanFirestorePayload(data) || {};
 await updateDoc(doc(db, colName, id), { ...payload, updated_at: serverTimestamp() });
}
export async function fsDelete(colName, id) {
 if (!id) return;
 await deleteDoc(doc(db, colName, String(id)));
}

export async function deleteBroadcastMemoAndNotifs(memoId) {
 if (!memoId) return;
 const strId = String(memoId);
 await fsDelete(COL.BROADCAST, strId);
 try {
 const allNotifs = await fsGetAll(COL.NOTIFICATIONS);
 const related = allNotifs.filter(n => 
 String(n.memo_id || "") === strId || 
 (n.link && String(n.link).includes(strId))
 );
 await Promise.all(related.map(n => fsDelete(COL.NOTIFICATIONS, n.id)));
 } catch (err) {
 console.warn("Gagal membersihkan notifikasi terkait memo:", err);
 }
}

/* ---------------------------------------------------------------------
 * 6. CSV EXPORT
 * ------------------------------------------------------------------- */
/**
 * Penulis CSV tingkat-rendah: headers & data SUDAH disiapkan (array of arrays),
 * tidak menebak-nebak struktur dari Object.keys() seperti exportToCsv() lama.
 * Dipakai oleh export kolom-terpilih di renderCrudModule (lihat components.js).
 */
export function downloadCsv(filename, headers, matrix) {
 if (!matrix || !matrix.length) { toast("Tidak ada data untuk diekspor", "warning"); return; }
 const escape = (v) => {
 const s = String(v ?? "");
 return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
 };
 const csv = [headers.map(escape).join(","), ...matrix.map(row => row.map(escape).join(","))].join("\n");
 const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url; a.download = filename.endsWith(".csv") ? filename : filename + ".csv";
 document.body.appendChild(a); a.click(); a.remove();
 URL.revokeObjectURL(url);
}

let _xlsxLoadingPromise = null;
export function ensureXlsxLoaded() {
 if (window.XLSX) return Promise.resolve();
 if (_xlsxLoadingPromise) return _xlsxLoadingPromise;
 _xlsxLoadingPromise = new Promise((resolve, reject) => {
 const script = document.createElement("script");
 script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
 script.onload = () => resolve();
 script.onerror = () => reject(new Error("Gagal memuat library Excel (SheetJS)."));
 document.head.appendChild(script);
 });
 return _xlsxLoadingPromise;
}

export async function downloadXlsx(arg1, arg2, arg3, arg4 = "Data") {
 await ensureXlsxLoaded();
 let filename = "export.xlsx";
 let ws = null;
 let sName = "Data";

 if (Array.isArray(arg1) && typeof arg2 === "string") {
 filename = arg2;
 sName = arg3 || "Data";
 if (!arg1 || !arg1.length) {
 toast("Tidak ada data untuk diekspor", "warning");
 return;
 }
 if (typeof arg1[0] === "object" && !Array.isArray(arg1[0])) {
 ws = window.XLSX.utils.json_to_sheet(arg1);
 } else if (Array.isArray(arg1[0])) {
 ws = window.XLSX.utils.aoa_to_sheet(arg1);
 }
 } else if (typeof arg1 === "string" && Array.isArray(arg2) && Array.isArray(arg3)) {
 filename = arg1;
 sName = typeof arg4 === "string" ? arg4 : "Data";
 if (!arg3 || !arg3.length) {
 toast("Tidak ada data untuk diekspor", "warning");
 return;
 }
 ws = window.XLSX.utils.aoa_to_sheet([arg2, ...arg3]);
 } else if (typeof arg1 === "string" && Array.isArray(arg2)) {
 filename = arg1;
 sName = typeof arg3 === "string" ? arg3 : "Data";
 if (typeof arg2[0] === "object" && !Array.isArray(arg2[0])) {
 ws = window.XLSX.utils.json_to_sheet(arg2);
 } else if (Array.isArray(arg2[0])) {
 ws = window.XLSX.utils.aoa_to_sheet(arg2);
 }
 }

 if (!ws) {
 toast("Tidak ada data valid untuk diekspor", "warning");
 return;
 }

 const wb = window.XLSX.utils.book_new();
 window.XLSX.utils.book_append_sheet(wb, ws, sName);
 window.XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : filename + ".xlsx");
}

/**
 * Format tanggal ke format bahasa Indonesia lengkap (e.g. "Senin, 05 Januari 2026")
 */
export function fmtDateIndoLong(dateStr) {
 if (!dateStr) return "-";
 const cleanStr = String(dateStr).substring(0, 10);
 const parts = cleanStr.split("-");
 if (parts.length !== 3) return dateStr;
 const year = parseInt(parts[0], 10);
 const monthIdx = parseInt(parts[1], 10) - 1;
 const day = parseInt(parts[2], 10);

 if (isNaN(year) || isNaN(monthIdx) || isNaN(day)) return dateStr;
 const d = new Date(year, monthIdx, day);
 if (isNaN(d.getTime())) return dateStr;

 const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
 const months = [
 "Januari", "Februari", "Maret", "April", "Mei", "Juni",
 "Juli", "Agustus", "September", "Oktober", "November", "Desember"
 ];

 const dayName = days[d.getDay()];
 const monthName = months[monthIdx] || "";
 const formattedDay = day < 10 ? "0" + day : String(day);

 return `${dayName}, ${formattedDay} ${monthName} ${year}`;
}

/**
 * Memformat array trip Uang Makan Ekspedisi menjadi baris-baris terurai
 * sesuai template Excel standar ("UANG JALAN 2026"):
 * Tanggal | Nama Karyawan | Jabatan | Area Kirim | Start | End | Jumlah Toko | Jumlah Terkirim | Nominal | STATUS | Validasi | bulan
 */
export function formatUangJalanEkspedisiRows(trips) {
 if (!Array.isArray(trips)) return [];
 const result = [];

 const sorted = [...trips].sort((a, b) => (a.tanggal || "").localeCompare(b.tanggal || ""));

 sorted.forEach(trip => {
 const dateStr = trip.tanggal ? String(trip.tanggal).substring(0, 10) : "";
 const formattedDate = fmtDateIndoLong(dateStr);
 const monthNum = dateStr && dateStr.includes("-") ? parseInt(dateStr.split("-")[1], 10) : 1;
 const start = trip.jam_berangkat ? String(trip.jam_berangkat).replace(":", ".") : "-";
 const end = trip.jam_tiba ? String(trip.jam_tiba).replace(":", ".") : "-";
 const jmlToko = trip.jml_toko !== undefined && trip.jml_toko !== null ? Number(trip.jml_toko) : 0;
 const jmlTerkirim = trip.realisasi_toko !== undefined && trip.realisasi_toko !== null ? Number(trip.realisasi_toko) : jmlToko;
 const statusNote = trip.keterangan_selisih && String(trip.keterangan_selisih).trim() ? String(trip.keterangan_selisih).trim().toUpperCase() : "0";

 // Row Driver
 if (trip.driver) {
 result.push({
 "Tanggal": formattedDate,
 "Nama Karyawan": String(trip.driver).toUpperCase(),
 "Jabatan": "Driver",
 "Area Kirim": String(trip.tujuan || "-").toUpperCase(),
 "Start": start,
 "End": end,
 "Jumlah Toko": jmlToko,
 "Jumlah Terkirim": jmlTerkirim,
 "Nominal": Number(trip.um_driver || 35000),
 "STATUS": statusNote,
 "Validasi": true,
 "bulan": monthNum
 });
 }

 // Row Helper
 if (trip.helper && String(trip.helper).trim()) {
 result.push({
 "Tanggal": formattedDate,
 "Nama Karyawan": String(trip.helper).toUpperCase(),
 "Jabatan": "Helper",
 "Area Kirim": String(trip.tujuan || "-").toUpperCase(),
 "Start": start,
 "End": end,
 "Jumlah Toko": jmlToko,
 "Jumlah Terkirim": jmlTerkirim,
 "Nominal": Number(trip.um_helper || 25000),
 "STATUS": statusNote,
 "Validasi": true,
 "bulan": monthNum
 });
 }
 });

 return result;
}

export function exportToCsv(filename, rows) {
 if (!rows || !rows.length) { toast("Tidak ada data untuk diekspor", "warning"); return; }
 const headers = Object.keys(rows[0]);
 const escape = (v) => {
 if (v === null || v === undefined) return "";
 if (typeof v === "object" && v.toDate) v = fmtDateShort(v);
 const s = String(v).replace(/"/g, '""');
 return /[",\n]/.test(s) ? `"${s}"` : s;
 };
 const csv = [headers.join(","), ...rows.map(r => headers.map(h => escape(r[h])).join(","))].join("\n");
 const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url; a.download = filename.endsWith(".csv") ? filename : filename + ".csv";
 document.body.appendChild(a); a.click(); a.remove();
 URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------------------
 * 7. SIMPLE FORMULA ENGINE — untuk Form Builder (rumus kalkulasi otomatis)
 * Mendukung sintaks: ([field_a] - [field_b]) * (10000/25)
 * Field ditulis dalam kurung siku dan namanya harus cocok dengan `name`
 * field lain pada form yang sama.
 * ------------------------------------------------------------------- */
export function evalFormula(formulaStr, valuesObj) {
 try {
 let expr = formulaStr.replace(/\[([a-zA-Z0-9_]+)\]/g, (_, key) => {
 const v = toNumber(valuesObj[key]);
 return isFinite(v) ? v : 0;
 });
 if (!/^[0-9+\-*/().\s]+$/.test(expr)) return null; // whitelist karakter matematika saja
 // eslint-disable-next-line no-new-func
 const result = Function(`"use strict"; return (${expr});`)();
 return isFinite(result) ? result : null;
 } catch (e) {
 return null;
 }
}

/* ---------------------------------------------------------------------
 * 8. QUERY STRING & HASH ROUTE HELPERS
 * ------------------------------------------------------------------- */
export function parseHash() {
 const raw = (location.hash || "").replace(/^#+/, "").replace(/^\/+/, "");
 const [pathRaw, qs] = raw.split("?");
 const path = (pathRaw || "").replace(/^\/+|\/+$/g, "").trim() || "dashboard";
 const params = new URLSearchParams(qs || "");
 return { path, params };
}
export function navigate(path, params = {}) {
 const cleanPath = String(path || "").replace(/^#+/, "").replace(/^\/+/, "").replace(/\/+$/, "").trim();
 const qs = new URLSearchParams(params).toString();
 location.hash = `#${cleanPath}${qs ? "?" + qs : ""}`;
}

export function escapeHtml(str = "") {
 if (str === null || str === undefined) return "";
 return String(str)
 .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
 .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
if (typeof window !== "undefined") {
 window.escapeHtml = escapeHtml;
}

/* ---------------------------------------------------------------------
 * GOOGLE DRIVE & ATTACHMENT VIEWER HELPERS
 * ------------------------------------------------------------------- */
export function normalizeDriveUrl(url) {
 if (!url || typeof url !== "string") return "#";
 const s = url.trim();
 if (s.startsWith("data:")) return s;

 // Normalisasi URL Google Drive file
 const driveFileIdMatch = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || 
 s.match(/id=([a-zA-Z0-9_-]+)/) ||
 s.match(/\/d\/([a-zA-Z0-9_-]+)/);
 if (driveFileIdMatch && driveFileIdMatch[1]) {
 const fileId = driveFileIdMatch[1];
 return `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
 }
 
 if (/^[a-zA-Z0-9_-]{25,100}$/.test(s)) {
 return `https://drive.google.com/file/d/${s}/view?usp=sharing`;
 }

 if (/^https?:\/\//i.test(s)) return s;
 return `https://${s}`;
}

export function openAttachment(url) {
 if (!url) {
 toast("Lampiran tidak ditemukan atau kosong", "warning");
 return;
 }
 
 const trimmed = String(url).trim();
 
 // Jika berupa data base64
 if (trimmed.startsWith("data:")) {
 try {
 const parts = trimmed.split(",");
 const mimeMatch = parts[0].match(/:(.*?);/);
 const mime = mimeMatch ? mimeMatch[1] : "image/png";
 const bstr = atob(parts[1]);
 let n = bstr.length;
 const u8arr = new Uint8Array(n);
 while (n--) {
 u8arr[n] = bstr.charCodeAt(n);
 }
 const blob = new Blob([u8arr], { type: mime });
 const blobUrl = URL.createObjectURL(blob);
 
 const win = window.open(blobUrl, "_blank");
 if (!win) {
 if (mime.startsWith("image/")) {
 openModal({
 title: "Pratinjau Lampiran Gambar",
 bodyHtml: `<div class="text-center p-2"><img src="${trimmed}" class="max-w-full max-h-[70vh] mx-auto rounded-lg shadow-sm" /></div>`,
 footerHtml: `<a href="${blobUrl}" download="lampiran" class="px-4 py-2 bg-maroon-700 text-white rounded-lg text-xs font-bold">Unduh File</a> <button id="close-img-preview" class="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold">Tutup</button>`,
 onMount: (m) => m.querySelector("#close-img-preview").onclick = closeModal
 });
 } else {
 toast("Izin popup diblokir browser. Izinkan popup untuk melihat lampiran.", "warning");
 }
 }
 } catch (e) {
 toast("Gagal membuka lampiran base64: " + e.message, "error");
 }
 return;
 }
 
 const targetUrl = normalizeDriveUrl(trimmed);
 const win = window.open(targetUrl, "_blank", "noopener,noreferrer");
 if (!win) {
 openModal({
 title: "Buka Lampiran",
 bodyHtml: `
 <div class="text-center p-4">
 <p class="text-sm text-slate-600 mb-4">Klik tombol di bawah untuk membuka lampiran file di tab baru:</p>
 <a href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 px-5 py-2.5 bg-maroon-700 text-white rounded-xl font-bold text-xs shadow hover:bg-maroon-800 transition">
 Buka Dokumen / Lampiran Google Drive
 </a>
 </div>`,
 footerHtml: `<button id="btn-close-att-modal" class="px-4 py-2 bg-slate-100 rounded text-xs font-semibold">Tutup</button>`,
 onMount: m => m.querySelector("#btn-close-att-modal").onclick = closeModal
 });
 }
}
if (typeof window !== "undefined") {
 window.openAttachment = openAttachment;
 window.normalizeDriveUrl = normalizeDriveUrl;
}

export function terbilang(n) {
 const angka = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
 let num = Math.floor(Math.abs(Number(n) || 0));
 if (num === 0) return "Nol Rupiah";
 function bilang(x) {
 if (x < 12) return angka[x];
 if (x < 20) return bilang(x - 10) + " Belas";
 if (x < 100) return bilang(Math.floor(x / 10)) + " Puluh " + bilang(x % 10);
 if (x < 200) return "Seratus " + bilang(x - 100);
 if (x < 1000) return bilang(Math.floor(x / 100)) + " Ratus " + bilang(x % 100);
 if (x < 2000) return "Seribu " + bilang(x - 1000);
 if (x < 1000000) return bilang(Math.floor(x / 1000)) + " Ribu " + bilang(x % 1000);
 if (x < 1000000000) return bilang(Math.floor(x / 1000000)) + " Juta " + bilang(x % 1000000);
 return String(x);
 }
 return bilang(num).trim().replace(/\s+/g, " ") + " Rupiah";
}

export function printSalesKlaimForm(item) {
 if (!item) return;
 const detail = item.detail || {};
 const detailList = detail.rincian_tabel || detail.rincian || detail.items || [];
 const total = Number(detail.total_klaim || detail.grand_total || detail.total || 0);
 const cabangArea = item.cabang || detail.cabang || "Cirebon";
 const HARGA_BENSIN = 10000;
 const RASIO_KM = 25;

 let totalJarak = 0, totalPetrol = 0, totalParkir = 0, totalDenda = 0;

 const tripRowsHtml = detailList.length > 0 ? detailList.map((r, i) => {
 const kmAwal = Number(r.km_awal || 0);
 const kmAkhir = Number(r.km_akhir || 0);
 const parkirRp = Number(r.parkir || 0);
 const dendaRp = Number(r.denda || 0);
 const trip = Math.max(0, kmAkhir - kmAwal);
 const petrolRp = Math.round(trip * (HARGA_BENSIN / RASIO_KM));
 const rowTotal = Number(r.total_baris || (petrolRp + parkirRp - dendaRp));

 totalJarak += trip;
 totalPetrol += petrolRp;
 totalParkir += parkirRp;
 totalDenda += dendaRp;

 return `
 <tr style="border-bottom: 1px solid #cbd5e1; font-size: 11px;">
 <td style="padding: 8px; text-align: center; font-weight: bold;">${i + 1}</td>
 <td style="padding: 8px;">${escapeHtml(r.tanggal || "-")}</td>
 <td style="padding: 8px; text-align: right; font-family: monospace;">${kmAwal.toLocaleString("id-ID")}</td>
 <td style="padding: 8px; text-align: right; font-family: monospace;">${kmAkhir.toLocaleString("id-ID")}</td>
 <td style="padding: 8px; text-align: right; font-weight: bold; font-family: monospace;">${trip} KM</td>
 <td style="padding: 8px; text-align: right; font-family: monospace;">Rp ${petrolRp.toLocaleString("id-ID")}</td>
 <td style="padding: 8px; text-align: right; font-family: monospace;">Rp ${parkirRp.toLocaleString("id-ID")}</td>
 <td style="padding: 8px; text-align: right; font-family: monospace; color: #b91c1c;">Rp ${dendaRp.toLocaleString("id-ID")}</td>
 <td style="padding: 8px;">${escapeHtml(r.tujuan || r.kunjungan || "-")}</td>
 <td style="padding: 8px; text-align: right; font-weight: bold; font-family: monospace; background-color: #f8fafc;">Rp ${rowTotal.toLocaleString("id-ID")}</td>
 </tr>
 `;
 }).join("") : `
 <tr><td colspan="10" style="padding: 16px; text-align: center; color: #64748b;">Tidak ada rincian baris perjalanan</td></tr>
 `;

 const terbilangStr = terbilang(total);

 const printWin = window.open("", "_blank", "width=900,height=750");
 if (!printWin) {
 toast("Izin popup diblokir browser. Izinkan popup untuk mencetak/mengunduh form.", "error");
 return;
 }

 printWin.document.write(`
 <!DOCTYPE html>
 <html lang="id">
 <head>
 <meta charset="UTF-8">
 <title>Form Klaim Bensin Sales — ${escapeHtml(item.nama_pemohon)}</title>
 <style>
 @page { size: A4 landscape; margin: 12mm; }
 body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; color: #0f172a; background: #fff; line-height: 1.4; }
 .header { border-bottom: 3px double #7a1f2b; padding-bottom: 12px; margin-bottom: 16px; text-align: center; }
 .header h2 { margin: 0; font-size: 20px; text-transform: uppercase; font-weight: 800; color: #7a1f2b; letter-spacing: 1px; }
 .header h3 { margin: 4px 0 0; font-size: 13px; color: #334155; font-weight: 700; text-transform: uppercase; }
 .header p { margin: 2px 0 0; font-size: 11px; color: #64748b; }
 
 .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; background: #f8fafc; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 11px; }
 .meta-item label { color: #64748b; font-size: 10px; display: block; text-transform: uppercase; font-weight: bold; }
 .meta-item span { font-weight: bold; color: #0f172a; font-size: 12px; }

 table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
 th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px; font-size: 10px; text-align: left; text-transform: uppercase; color: #334155; font-weight: 800; }
 td { border: 1px solid #cbd5e1; font-size: 11px; }

 .summary-box { display: flex; justify-content: space-between; align-items: center; background: #faf8ff; border: 1.5px solid #7a1f2b; padding: 12px 16px; border-radius: 8px; margin-bottom: 24px; }
 .terbilang { font-size: 11px; color: #475569; font-style: italic; }
 .terbilang strong { color: #7a1f2b; font-style: normal; }
 .total-nominal { font-size: 16px; font-weight: 900; color: #7a1f2b; font-family: monospace; }

 .signatures { margin-top: 30px; page-break-inside: avoid; }
 .sig-date { text-align: right; font-size: 11px; font-weight: bold; margin-bottom: 16px; color: #475569; }
 .sig-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; text-align: center; }
 .sig-box { font-size: 10px; background: #fff; border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px; }
 .sig-box p { margin: 0 0 6px; font-weight: bold; color: #334155; text-transform: uppercase; }
 .sig-space { height: 50px; }
 .sig-name { font-weight: bold; border-top: 1px solid #94a3b8; padding-top: 4px; color: #0f172a; }

 .no-print-bar { background: #1e293b; color: white; padding: 10px 16px; margin: -20px -20px 20px -20px; display: flex; justify-content: space-between; align-items: center; }
 .btn-print { background: #7a1f2b; color: white; border: none; padding: 8px 16px; font-weight: bold; border-radius: 6px; cursor: pointer; font-size: 12px; }
 .btn-print:hover { background: #991b1b; }

 @media print {
 * {
 -webkit-print-color-adjust: exact !important;
 print-color-adjust: exact !important;
 color-adjust: exact !important;
 }
 .no-print-bar { display: none !important; }
 body { padding: 0; }
 }
 </style>
 </head>
 <body>
 <div class="no-print-bar">
 <span><b>Form Klaim Bensin Sales CV Andela Jaya</b></span>
 <button class="btn-print" onclick="window.print()">Cetak / Simpan PDF</button>
 </div>

 ${letterheadHtml()}

 <div style="text-align:center;margin-bottom:16px;">
 <h3 style="margin:0;font-size:15px;color:#7a1f2b;font-weight:bold;text-transform:uppercase;">FORM KLAIM BENSIN & OPERASIONAL SALES</h3>
 <p style="margin:4px 0 0;font-size:11px;color:#64748b;">Cabang / Area Operasional: <strong>${escapeHtml(cabangArea).toUpperCase()}</strong> • No. Transaksi: <strong>${escapeHtml(item.id)}</strong></p>
 </div>

 <div class="meta-grid">
 <div class="meta-item">
 <label>Nama Pemohon / Sales</label>
 <span>${escapeHtml(item.nama_pemohon)}</span>
 </div>
 <div class="meta-item">
 <label>NIK / Cabang</label>
 <span>${escapeHtml(item.nik || "-")} / ${escapeHtml(cabangArea)}</span>
 </div>
 <div class="meta-item">
 <label>Tanggal Ajuan</label>
 <span>${fmtDateTime(item.tgl)}</span>
 </div>
 <div class="meta-item">
 <label>Jenis BBM / Status</label>
 <span>Pertalite (1L / 25 KM) • <strong style="color: #047857;">${escapeHtml(item.status_final || "MENUNGGU")}</strong></span>
 </div>
 </div>

 <table>
 <thead>
 <tr>
 <th style="text-align: center; width: 30px;">NO</th>
 <th>TGL PERJALANAN</th>
 <th style="text-align: right;">KM AWAL</th>
 <th style="text-align: right;">KM AKHIR</th>
 <th style="text-align: right;">JARAK (KM)</th>
 <th style="text-align: right;">PETROL (Rp)</th>
 <th style="text-align: right;">PARKIR (Rp)</th>
 <th style="text-align: right;">DENDA (Rp)</th>
 <th>TUJUAN / DAFTAR KUNJUNGAN TOKO</th>
 <th style="text-align: right;">TOTAL BARIS</th>
 </tr>
 </thead>
 <tbody>
 ${tripRowsHtml}
 </tbody>
 </table>

 <div class="summary-box">
 <div class="terbilang">
 Terbilang: <strong>${escapeHtml(terbilangStr)}</strong>
 </div>
 <div class="total-nominal">
 TOTAL KLAIM SALES: Rp ${total.toLocaleString("id-ID")}
 </div>
 </div>

 <div class="signatures">
 <div class="sig-date">${escapeHtml(cabangArea)}, ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</div>
 <div class="sig-grid">
 <div class="sig-box">
 <p>Yang Mengajukan,</p>
 <div class="sig-space"></div>
 <div class="sig-name">( ${escapeHtml(item.nama_pemohon)} )<br/><span style="font-weight:normal; font-size:9px;">Sales / Operasional</span></div>
 </div>
 <div class="sig-box">
 <p>Mengetahui Direct Spv,</p>
 <div class="sig-space"></div>
 <div class="sig-name">( SPV Sales / Manager )<br/><span style="font-weight:normal; font-size:9px;">Atasan Langsung</span></div>
 </div>
 <div class="sig-box">
 <p>Diverifikasi HRD,</p>
 <div class="sig-space"></div>
 <div class="sig-name">( Staff HRD )<br/><span style="font-weight:normal; font-size:9px;">HRGA & Operasional</span></div>
 </div>
 <div class="sig-box">
 <p>Disetujui Finance,</p>
 <div class="sig-space"></div>
 <div class="sig-name">( Finance / Kasir )<br/><span style="font-weight:normal; font-size:9px;">Pencairan Dana</span></div>
 </div>
 </div>
 </div>
 </body>
 </html>
 `);
 printWin.document.close();
}

export function generateStandardFormCutiHtml(opts = {}) {
 const {
 namaKaryawan = "Karyawan",
 divisi = "-",
 jabatan = "-",
 cabang = "-",
 jenisCuti = "Cuti",
 isHalfDay = false,
 tglMulai = new Date().toISOString(),
 tglSelesai = tglMulai,
 jamKeluar = "-",
 jamKembali = "-",
 kontak = "-",
 alasan = "-",
 sisaTahunan = 0,
 sisaKhusus = 0,
 sisaAkumulasi = 0,
 tglPengajuan = new Date().toISOString(),
 pejabatPengganti = "-",
 catatanAtasan = ""
 } = opts;

 const fmtMulai = fmtDate(tglMulai);
 const fmtSelesai = fmtDate(tglSelesai);
 const fmtTglPengajuan = fmtDate(tglPengajuan);

 const locationDateStr = `CIREBON, ${fmtTglPengajuan !== "-" ? fmtTglPengajuan : fmtDate(new Date())}`;

 let divisiDisplay = divisi;
 if (!divisiDisplay || divisiDisplay === "-") {
 divisiDisplay = jabatan !== "-" ? jabatan : (cabang !== "-" ? cabang : "Staff");
 } else if (jabatan && jabatan !== "-" && jabatan !== divisiDisplay) {
 divisiDisplay = `${jabatan} / ${divisiDisplay}`;
 }

 const headerTitle = isHalfDay 
 ? "FORMULIR PENGAJUAN CUTI SETENGAH HARI" 
 : "FORMULIR PENGAJUAN CUTI KARYAWAN";

 return `<!DOCTYPE html>
<html lang="id">
<head>
 <meta charset="UTF-8">
 <title>Form Cuti — ${escapeHtml(namaKaryawan)}</title>
 <style>
 @page { size: A4 portrait; margin: 10mm 12mm; }
 * {
 box-sizing: border-box;
 -webkit-print-color-adjust: exact !important;
 print-color-adjust: exact !important;
 color-adjust: exact !important;
 }
 body {
 font-family: 'Times New Roman', Times, serif;
 font-size: 14px;
 line-height: 1.5;
 color: #000;
 background: #fff;
 margin: 0;
 padding: 10px 0 0 0;
 -webkit-print-color-adjust: exact !important;
 print-color-adjust: exact !important;
 color-adjust: exact !important;
 }
 .no-print-bar {
 position: fixed;
 top: 12px;
 right: 16px;
 z-index: 9999;
 }
 .btn-cetak {
 background: #7a1f2b;
 color: white;
 border: none;
 padding: 8px 16px;
 border-radius: 6px;
 font-weight: bold;
 font-size: 13px;
 cursor: pointer;
 box-shadow: 0 2px 8px rgba(0,0,0,0.2);
 display: inline-flex;
 align-items: center;
 gap: 6px;
 font-family: Arial, sans-serif;
 }
 .btn-cetak:hover {
 background: #5c1720;
 }
 
 .cuti-box {
 width: 100%;
 max-width: 760px;
 margin: 0 auto;
 border: 2px solid #000;
 background: #fff;
 }

 .hdr-table {
 width: 100%;
 border-collapse: collapse;
 border-bottom: 2px solid #000;
 }
 .hdr-table td {
 border: 1px solid #000;
 vertical-align: middle;
 }
 .hdr-logo {
 width: 110px;
 text-align: center;
 padding: 8px;
 }
 .hdr-title-1 {
 font-size: 16px;
 font-weight: bold;
 text-align: center;
 text-transform: uppercase;
 padding: 8px;
 background-color: #dbeafe !important;
 -webkit-print-color-adjust: exact !important;
 print-color-adjust: exact !important;
 color-adjust: exact !important;
 }
 .hdr-title-2 {
 font-size: 16px;
 font-weight: bold;
 text-align: center;
 background-color: #dbeafe !important;
 padding: 6px;
 text-transform: uppercase;
 -webkit-print-color-adjust: exact !important;
 print-color-adjust: exact !important;
 color-adjust: exact !important;
 }
 .hdr-meta {
 width: 100%;
 border-collapse: collapse;
 }
 .hdr-meta td {
 border-right: 1px solid #000;
 font-size: 12px;
 padding: 5px 8px;
 text-align: left;
 }
 .hdr-meta td:last-child {
 border-right: none;
 }

 .body-section {
 padding: 15px 22px 18px 22px;
 }

 .sec-head {
 font-weight: bold;
 font-size: 14px;
 text-transform: uppercase;
 margin-top: 6px;
 margin-bottom: 8px;
 }

 .data-table {
 width: 100%;
 border-collapse: collapse;
 margin-bottom: 8px;
 }
 .data-table td {
 padding: 4px 0;
 vertical-align: top;
 font-size: 14px;
 }
 .lbl-col {
 width: 230px;
 }

 .sig-section {
 margin-top: 22px;
 width: 100%;
 }
 .sig-location {
 font-size: 14px;
 margin-bottom: 12px;
 }
 .sig-table {
 width: 100%;
 border-collapse: collapse;
 text-align: center;
 page-break-inside: avoid;
 }
 .sig-table td {
 width: 33.33%;
 padding: 0 5px;
 font-size: 14px;
 }

 .notes-section {
 border-top: 2px solid #000;
 border-bottom: 2px solid #000;
 padding: 10px 22px;
 min-height: 55px;
 }
 .notes-title {
 font-size: 14px;
 font-weight: normal;
 }

 .notice-section {
 padding: 10px 22px 12px 22px;
 font-size: 13px;
 line-height: 1.45;
 }
 .notice-title {
 margin-bottom: 4px;
 font-weight: normal;
 }
 .notice-list {
 margin: 0;
 padding-left: 18px;
 }
 .notice-list li {
 margin-bottom: 3px;
 }

 @media print {
 * {
 -webkit-print-color-adjust: exact !important;
 print-color-adjust: exact !important;
 color-adjust: exact !important;
 }
 .no-print-bar { display: none !important; }
 body { padding: 0; margin: 0; }
 .cuti-box { border: 2px solid #000 !important; width: 100% !important; max-width: none !important; }
 .hdr-title-1, .hdr-title-2 {
 background-color: #dbeafe !important;
 -webkit-print-color-adjust: exact !important;
 print-color-adjust: exact !important;
 color-adjust: exact !important;
 }
 }
 </style>
</head>
<body>
 ${opts.forPdf ? "" : `
  <div class="no-print-bar">
    <button onclick="downloadThisPdf()" class="btn-download-pdf">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Download PDF
    </button>
    <button onclick="window.print()" class="btn-cetak">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
      Cetak (Print)
    </button>
  </div>`}

 <div class="cuti-box">
 <table class="hdr-table">
 <tr>
 <td rowspan="3" class="hdr-logo">${logoImgTag(70)}</td>
 <td class="hdr-title-1" style="background-color:#dbeafe !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;">${headerTitle}</td>
 </tr>
 <tr>
 <td class="hdr-title-2" style="background-color:#dbeafe !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;">${COMPANY_NAME}</td>
 </tr>
 <tr>
 <td style="padding:0;">
 <table class="hdr-meta">
 <tr>
 <td>Hal : 1 dari 1</td>
 <td>No Dok : HR4</td>
 <td>Terbit/ Revisi : 1/1</td>
 <td>Tgl terbit : 1 September 2025</td>
 </tr>
 </table>
 </td>
 </tr>
 </table>

 <div class="body-section">
 <div class="sec-head">DATA KARYAWAN</div>
 <table class="data-table">
 <tr>
 <td class="lbl-col">Nama Lengkap</td>
 <td style="width: 15px;">:</td>
 <td><strong>${escapeHtml(namaKaryawan)}</strong></td>
 </tr>
 <tr>
 <td class="lbl-col">Divisi / Bagian / Unit Kerja</td>
 <td style="width: 15px;">:</td>
 <td>${escapeHtml(divisiDisplay)}</td>
 </tr>
 </table>

 <div class="sec-head" style="margin-top: 12px;">KETERANGAN CUTI</div>
 <table class="data-table">
 ${isHalfDay ? `
 <tr>
 <td class="lbl-col">Tanggal Cuti</td>
 <td style="width: 15px;">:</td>
 <td>${fmtMulai}</td>
 </tr>
 <tr>
 <td class="lbl-col">Waktu Cuti</td>
 <td style="width: 15px;">:</td>
 <td>${escapeHtml(jamKeluar)} s/d ${escapeHtml(jamKembali)}</td>
 </tr>
 ` : `
 <tr>
 <td class="lbl-col">Tanggal Cuti</td>
 <td style="width: 15px;">:</td>
 <td>${fmtMulai}</td>
 </tr>
 <tr>
 <td class="lbl-col">Tanggal Selesai Cuti</td>
 <td style="width: 15px;">:</td>
 <td>${fmtSelesai}</td>
 </tr>
 `}
 <tr><td colspan="3" style="height: 6px;"></td></tr>
 <tr>
 <td class="lbl-col">Alamat & No HP Selama Cuti</td>
 <td style="width: 15px;">:</td>
 <td>${escapeHtml(kontak)}</td>
 </tr>
 <tr>
 <td class="lbl-col">Keterangan/Alasan</td>
 <td style="width: 15px;">:</td>
 <td>${escapeHtml(alasan)}</td>
 </tr>
 <tr><td colspan="3" style="height: 6px;"></td></tr>
 <tr>
 <td class="lbl-col"><strong>Sisa cuti tahunan</strong></td>
 <td style="width: 15px;">:</td>
 <td>${sisaTahunan}</td>
 </tr>
 <tr>
 <td class="lbl-col"><strong>Sisa cuti khusus</strong></td>
 <td style="width: 15px;">:</td>
 <td>${sisaKhusus}</td>
 </tr>
 <tr>
 <td class="lbl-col"><strong>Sisa cuti akumulasi</strong></td>
 <td style="width: 15px;">:</td>
 <td>${sisaAkumulasi}</td>
 </tr>
 </table>

 <div class="sig-section">
 <div class="sig-location">${locationDateStr}</div>
 <table class="sig-table">
 <tr>
 <td style="text-align: center; vertical-align: top;">
 Pemohon Cuti,
 </td>
 <td style="text-align: center; vertical-align: top;">
 Menyetujui,<br/>Atasan
 </td>
 <td style="text-align: center; vertical-align: top;">
 Mengetahui,<br/>HRD
 </td>
 </tr>
 <tr>
 <td style="height: 60px;"></td>
 <td style="height: 60px;"></td>
 <td style="height: 60px;"></td>
 </tr>
 <tr>
 <td style="text-align: center; vertical-align: bottom;">
 ( ......................... )
 </td>
 <td style="text-align: center; vertical-align: bottom;">
 ( ......................... )
 </td>
 <td style="text-align: center; vertical-align: bottom;">
 ( ......................... )
 </td>
 </tr>
 </table>
 </div>
 </div>

 <div class="notes-section">
 <div class="notes-title">Catatan dari Atasan${catatanAtasan ? `: <i>${escapeHtml(catatanAtasan)}</i>` : ""}</div>
 </div>

 <div class="notice-section">
 <div class="notice-title">Perhatikan :</div>
 <ol class="notice-list">
 <li>Surat permohonan cuti ini harus diajukan minimal 1 minggu sebelum cuti dijalankan.</li>
 <li>Sebelum ada persetujuan dari atasan, tidak diperkenankan untuk meninggalkan/mendahului cuti, kecuali sakit dengan dibuktikan dengan surat keterangan dokter atau karena keperluan yang mendesak.</li>
 </ol>
 </div>
 </div>
</body>
</html>`;
}

export async function downloadFormCutiPdf(item) {
	if (!item) return;
	if (typeof item === 'string') {
		try { item = JSON.parse(item); } catch (e) {}
	}

	try {
		if (typeof toast === "function") toast("Sedang memproses unduhan Form Cuti PDF...", "info");

		const detail = item.detail || {};
		const namaKaryawan = item.nama_pemohon || item.nama_karyawan || item.pemohon || detail.nama_karyawan || "Karyawan";
		const nik = item.nik || item.nik_pemohon || detail.nik || "-";
		const cabang = item.cabang || detail.cabang || "-";
		const jabatan = detail.jabatan || item.jabatan || detail.divisi || "-";
		const divisi = detail.divisi || item.divisi || detail.jabatan || item.jabatan || "-";
		const jenisCuti = item.kategori_cuti || item.jenis_cuti || detail.jenis_cuti || item.type_cuti || "Cuti";
		const isHalfDay = (jenisCuti || "").toLowerCase().includes("setengah hari") || (jenisCuti || "").includes("1/2");
		
		const tglMulai = item.tanggal_mulai || detail.tanggal_mulai || item.tanggal || item.tgl || new Date().toISOString();
		const tglSelesai = item.tanggal_selesai || detail.tanggal_akhir || detail.tanggal_selesai || tglMulai;
		const alasan = item.alasan || detail.alasan || detail.keterangan || item.keterangan_cuti || "Pengajuan Cuti";
		const kontak = item.no_telepon || detail.no_telepon || detail.kontak || item.alamat_dan_hp || detail.alamat_dan_hp || "-";
		const jamKeluar = detail.jam_keluar || "-";
		const jamKembali = detail.jam_kembali || "-";
		const pejabatPengganti = item.pejabat_pengganti || detail.pejabat_pengganti || "-";
		const tglPengajuan = item.tgl || item.createdAt || new Date().toISOString();

		let sisaTahunan = item.sisa_tahunan ?? detail.sisa_tahunan ?? item.sisa_tahunan_display ?? null;
		let sisaKhusus = item.sisa_khusus ?? detail.sisa_khusus ?? item.sisa_khusus_display ?? null;
		let sisaAkumulasi = item.sisa_akumulasi ?? detail.sisa_akumulasi ?? item.sisa_akumulasi_display ?? null;

		if (sisaTahunan === null || sisaTahunan === undefined) {
			try {
				const [allEmp, allMasterCuti] = await Promise.all([
					fsGetAll(COL.MASTER_KARYAWAN),
					fsGetAll(COL.MASTER_CUTI)
				]);
				const kData = allEmp.find(k => 
					(k.nama_karyawan || "").trim().toLowerCase() === (namaKaryawan || "").trim().toLowerCase() ||
					(nik !== "-" && String(k.nik || k.nik_karyawan) === String(nik))
				);
				const empCuti = allMasterCuti.filter(d => 
					(d.nama_karyawan || "").trim().toLowerCase() === (namaKaryawan || "").trim().toLowerCase() ||
					(nik !== "-" && String(d.nik || d.nik_karyawan) === String(nik))
				);

				const calc = getCalculatedJatahCuti(kData, empCuti);
				sisaTahunan = calc.sisaTahunan;
				sisaKhusus = calc.sisaKhusus;
				sisaAkumulasi = calc.sisaAkumulasi;
			} catch (errCalc) {
				sisaTahunan = 0;
				sisaKhusus = 0;
				sisaAkumulasi = 0;
			}
		}

		const html = generateStandardFormCutiHtml({
			namaKaryawan,
			divisi,
			jabatan,
			cabang,
			jenisCuti,
			isHalfDay,
			tglMulai,
			tglSelesai,
			jamKeluar,
			jamKembali,
			kontak,
			alasan,
			sisaTahunan: sisaTahunan ?? 0,
			sisaKhusus: sisaKhusus ?? 0,
			sisaAkumulasi: sisaAkumulasi ?? 0,
			tglPengajuan,
			pejabatPengganti,
			catatanAtasan: item.catatan_atasan || detail.catatan_atasan || "",
			forPdf: true
		});

		const cleanFileName = "Form_Cuti_" + (namaKaryawan || "Karyawan").replace(/[^a-zA-Z0-9_-]/g, "_") + ".pdf";
		await downloadHtmlAsPdf(html, cleanFileName);
		if (typeof toast === "function") toast("Dokumen Form Cuti PDF berhasil diunduh!", "success");
	} catch (err) {
		console.error("Error downloadFormCutiPdf:", err);
		if (typeof toast === "function") toast("Gagal mengunduh form cuti: " + err.message, "error");
	}
}

export async function printFormCutiFisik(item) {
	if (!item) return;
	if (typeof item === 'string') {
		try { item = JSON.parse(item); } catch (e) {}
	}

	try {
		const detail = item.detail || {};
		const namaKaryawan = item.nama_pemohon || item.nama_karyawan || item.pemohon || detail.nama_karyawan || "Karyawan";
		const nik = item.nik || item.nik_pemohon || detail.nik || "-";
		const cabang = item.cabang || detail.cabang || "-";
		const jabatan = detail.jabatan || item.jabatan || detail.divisi || "-";
		const divisi = detail.divisi || item.divisi || detail.jabatan || item.jabatan || "-";
		const jenisCuti = item.kategori_cuti || item.jenis_cuti || detail.jenis_cuti || item.type_cuti || "Cuti";
		const isHalfDay = (jenisCuti || "").toLowerCase().includes("setengah hari") || (jenisCuti || "").includes("1/2");
		
		const tglMulai = item.tanggal_mulai || detail.tanggal_mulai || item.tanggal || item.tgl || new Date().toISOString();
		const tglSelesai = item.tanggal_selesai || detail.tanggal_akhir || detail.tanggal_selesai || tglMulai;
		const alasan = item.alasan || detail.alasan || detail.keterangan || item.keterangan_cuti || "Pengajuan Cuti";
		const kontak = item.no_telepon || detail.no_telepon || detail.kontak || item.alamat_dan_hp || detail.alamat_dan_hp || "-";
		const jamKeluar = detail.jam_keluar || "-";
		const jamKembali = detail.jam_kembali || "-";
		const pejabatPengganti = item.pejabat_pengganti || detail.pejabat_pengganti || "-";
		const tglPengajuan = item.tgl || item.createdAt || new Date().toISOString();

		// Dynamically calculate accurate sisa cuti from database if not explicitly attached
		let sisaTahunan = item.sisa_tahunan ?? detail.sisa_tahunan ?? item.sisa_tahunan_display ?? null;
		let sisaKhusus = item.sisa_khusus ?? detail.sisa_khusus ?? item.sisa_khusus_display ?? null;
		let sisaAkumulasi = item.sisa_akumulasi ?? detail.sisa_akumulasi ?? item.sisa_akumulasi_display ?? null;

		if (sisaTahunan === null || sisaTahunan === undefined) {
			try {
				const [allEmp, allMasterCuti] = await Promise.all([
					fsGetAll(COL.MASTER_KARYAWAN),
					fsGetAll(COL.MASTER_CUTI)
				]);
				const kData = allEmp.find(k => 
					(k.nama_karyawan || "").trim().toLowerCase() === (namaKaryawan || "").trim().toLowerCase() ||
					(nik !== "-" && String(k.nik || k.nik_karyawan) === String(nik))
				);
				const empCuti = allMasterCuti.filter(d => 
					(d.nama_karyawan || "").trim().toLowerCase() === (namaKaryawan || "").trim().toLowerCase() ||
					(nik !== "-" && String(d.nik || d.nik_karyawan) === String(nik))
				);

				const calc = getCalculatedJatahCuti(kData, empCuti);
				sisaTahunan = calc.sisaTahunan;
				sisaKhusus = calc.sisaKhusus;
				sisaAkumulasi = calc.sisaAkumulasi;
			} catch (errCalc) {
				console.warn("Could not calculate dynamic sisa cuti:", errCalc);
				sisaTahunan = 0;
				sisaKhusus = 0;
				sisaAkumulasi = 0;
			}
		}

		const html = generateStandardFormCutiHtml({
			namaKaryawan,
			divisi,
			jabatan,
			cabang,
			jenisCuti,
			isHalfDay,
			tglMulai,
			tglSelesai,
			jamKeluar,
			jamKembali,
			kontak,
			alasan,
			sisaTahunan: sisaTahunan ?? 0,
			sisaKhusus: sisaKhusus ?? 0,
			sisaAkumulasi: sisaAkumulasi ?? 0,
			tglPengajuan,
			pejabatPengganti,
			catatanAtasan: item.catatan_atasan || detail.catatan_atasan || "",
			forPdf: false
		});

		let printWin = null;
		try {
			printWin = window.open("", "_blank", "width=850,height=900");
		} catch (e) {
			printWin = null;
		}

		if (printWin) {
			try {
				printWin.document.open();
				printWin.document.write(html);
				printWin.document.close();
				return;
			} catch (e) {
				console.warn("Writing to popup window failed:", e);
			}
		}

		// Fallback jika popup diblokir / sandbox: langsung download PDF
		if (typeof toast === "function") toast("Mengunduh Form Cuti PDF...", "info");
		const cleanFileName = "Form_Cuti_" + (namaKaryawan || "Karyawan").replace(/\s+/g, "_") + ".pdf";
		await downloadHtmlAsPdf(html, cleanFileName);
		if (typeof toast === "function") toast("Dokumen Form Cuti berhasil diunduh!", "success");
	} catch (err) {
		console.error("Error printFormCutiFisik:", err);
		if (typeof toast === "function") toast("Gagal memproses dokumen form cuti: " + err.message, "error");
	}
}

export async function generateAndSaveCutiDocument(row) {
 if (!row) return null;
 const detail = row.detail || {};
 const namaKaryawan = row.nama_pemohon || row.nama_karyawan || detail.nama_karyawan || "Karyawan";
 const nik = row.nik_pemohon || row.nik || detail.nik || "-";
 const cabang = row.cabang || detail.cabang || "-";
 const jabatan = detail.jabatan || row.jabatan || "-";
 const jenisCuti = row.kategori_cuti || row.jenis_cuti || detail.jenis_cuti || row.type_cuti || "Cuti";
 const isHalfDay = (jenisCuti || "").toLowerCase().includes("setengah hari") || (jenisCuti || "").includes("1/2");
 
 const tglMulai = row.tanggal_mulai || detail.tanggal_mulai || row.tanggal || row.tgl || new Date().toISOString();
 const tglSelesai = row.tanggal_selesai || detail.tanggal_akhir || detail.tanggal_selesai || tglMulai;
 const jumlahHari = parseFloat(row.jumlah_hari || detail.jumlah_hari || row.count || (isHalfDay ? 0.5 : 1));
 const alasan = row.alasan || detail.alasan || detail.keterangan || row.keterangan_cuti || "Pengajuan Cuti Disetujui";
 const kontak = row.no_telepon || detail.no_telepon || detail.kontak || "-";
 const jamKeluar = detail.jam_keluar || "-";
 const jamKembali = detail.jam_kembali || "-";

 let pdfUrl = null;

 try {
 const { generateCutiDocViaGAS } = await import("./gas-integration.js");
 const gasRes = await generateCutiDocViaGAS({
 nama_karyawan: namaKaryawan,
 jabatan: jabatan,
 cabang: cabang,
 tanggal: tglMulai,
 tanggal_display: fmtDateShort(tglMulai),
 tgl_akhir: tglSelesai,
 tgl_akhir_display: fmtDateShort(tglSelesai),
 isHalfDay,
 count: jumlahHari,
 keterangan_cuti: alasan,
 kontak,
 jam_keluar: jamKeluar,
 jam_kembali: jamKembali,
 sisa_tahunan: 12,
 sisa_khusus: 0,
 tanggal_pengajuan: fmtDateShort(row.tgl || new Date())
 });
 if (gasRes && gasRes.pdfUrl) {
 pdfUrl = gasRes.pdfUrl;
 }
 } catch (err) {
 console.warn("GAS document creation failed or not configured, falling back to local physical document generator:", err.message);
 }

 const updateData = {
 dokumen_url: pdfUrl || "#",
 pdf_url: pdfUrl || "#",
 form_fisik_generated: true,
 form_fisik_generated_at: new Date().toISOString()
 };

 // Update DATA_PENGAJUAN
 if (row.id) {
 await fsUpdate(COL.DATA_PENGAJUAN, row.id, updateData).catch(() => {});
 }

 // Update MASTER_CUTI if matching
 try {
 const allMaster = await fsGetAll(COL.MASTER_CUTI).catch(() => []);
 const match = allMaster.find(m => 
 (m.no_referensi && m.no_referensi === row.id) ||
 (m.nama_karyawan === namaKaryawan && m.tanggal === tglMulai)
 );
 if (match) {
 await fsUpdate(COL.MASTER_CUTI, match.id, updateData).catch(() => {});
 }
 } catch (e) {
 console.warn("Could not update MASTER_CUTI with doc URL:", e);
 }

 // Add to SIGN_DOCUMENTS so it appears in Employee Profile / Sign Documents list
 try {
 const docId = genId("DOC_CUTI");
 await fsAdd("sign_documents", {
 id: docId,
 no_referensi: row.id || docId,
 judul: `Formulir Cuti Fisik - ${namaKaryawan} (${fmtDateShort(tglMulai)})`,
 nik_penerima: nik,
 nama_penerima: namaKaryawan,
 tanggal_buat: fmtDateShort(row.tgl || new Date()),
 status: "APPROVED_FINAL",
 file_url: pdfUrl || "#",
 dokumen_url: pdfUrl || "#",
 tipe_dokumen: "FORM_CUTI_FISIK"
 }, docId).catch(() => {});
 } catch (e) {
 console.warn("Could not write sign_documents entry:", e);
 }

 return { pdfUrl };
}

if (typeof window !== "undefined") {
 window.printSalesKlaimForm = printSalesKlaimForm;
 window.printFormCutiFisik = printFormCutiFisik;
  window.downloadFormCutiPdf = downloadFormCutiPdf;
}

export function renderPengajuanDetailHtml(row, session, options = {}) {
 if (!row) return "<p class='text-slate-400'>Data tidak ditemukan</p>";
 const detail = row.detail || {};
 const isKlaimBensin = row.form_id === "F-KLAIM-BENSIN" || (row.nama_form || "").toLowerCase().includes("bensin");
 
 if (isKlaimBensin) {
 const detailList = detail.rincian_tabel || detail.rincian || detail.items || [];
 const totalKlaim = Number(detail.total_klaim || detail.grand_total || detail.total || 0);
 const HARGA_BENSIN = 10000;
 const RASIO_KM = 25;

 let totalKm = 0, totalPetrol = 0, totalParkir = 0, totalDenda = 0;

 const rowsHtml = detailList.length > 0 ? detailList.map((r, i) => {
 const kmAwal = Number(r.km_awal || 0);
 const kmAkhir = Number(r.km_akhir || 0);
 const parkir = Number(r.parkir || 0);
 const denda = Number(r.denda || 0);
 const trip = Math.max(0, kmAkhir - kmAwal);
 const petrol = Math.round(trip * (HARGA_BENSIN / RASIO_KM));
 const rowTotal = Number(r.total_baris || (petrol + parkir - denda));

 totalKm += trip;
 totalPetrol += petrol;
 totalParkir += parkir;
 totalDenda += denda;

 const catHrd = r.catatan_hrd ? `<span class="block text-[10px] text-amber-700 bg-amber-50 p-1 rounded mt-1 border border-amber-200">Rev HRD: ${escapeHtml(r.catatan_hrd)}</span>` : "";

 return `
 <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-xs">
 <td class="p-2.5 text-center font-bold text-slate-500">${i + 1}</td>
 <td class="p-2.5 font-medium text-slate-700">${escapeHtml(r.tanggal || "-")}</td>
 <td class="p-2.5 text-right font-mono">${kmAwal.toLocaleString("id-ID")}</td>
 <td class="p-2.5 text-right font-mono">${kmAkhir.toLocaleString("id-ID")}</td>
 <td class="p-2.5 text-right font-mono font-bold text-slate-800">${trip} KM</td>
 <td class="p-2.5 text-right font-mono text-slate-700">Rp ${petrol.toLocaleString("id-ID")}</td>
 <td class="p-2.5 text-right font-mono text-slate-700">Rp ${parkir.toLocaleString("id-ID")}</td>
 <td class="p-2.5 text-right font-mono text-red-600">Rp ${denda.toLocaleString("id-ID")}</td>
 <td class="p-2.5 text-slate-700">${escapeHtml(r.tujuan || r.kunjungan || "-")} ${catHrd}</td>
 <td class="p-2.5 text-right font-mono font-bold text-maroon-700 bg-slate-50">Rp ${rowTotal.toLocaleString("id-ID")}</td>
 </tr>
 `;
 }).join("") : `
 <tr><td colspan="10" class="p-6 text-center text-slate-400">Tidak ada rincian baris perjalanan.</td></tr>
 `;

 const rowJson = escapeHtml(JSON.stringify(row)).replace(/"/g, '&quot;');

 return `
 <div class="space-y-4 text-left">
 <!-- HEADER KLAIM BENSIN -->
 <div class="bg-gradient-to-r from-slate-900 via-slate-800 to-maroon-950 text-white p-4 rounded-2xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
 <div>
 <div class="flex items-center gap-2">
 <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400 text-slate-950 uppercase tracking-wide">KLAIM BENSIN SALES</span>
 <span class="text-xs text-slate-300">ID: ${escapeHtml(row.id)}</span>
 </div>
 <h3 class="text-lg font-black mt-1 text-white">${escapeHtml(row.nama_pemohon)}</h3>
 <p class="text-xs text-slate-300">Area / Cabang: <span class="font-bold text-amber-300">${escapeHtml(row.cabang || detail.cabang || "Cirebon")}</span> • NIK: ${escapeHtml(row.nik || "-")}</p>
 </div>
 <div class="text-right bg-white/10 px-4 py-2.5 rounded-xl border border-white/10 w-full sm:w-auto">
 <span class="text-[10px] text-slate-300 block uppercase font-bold tracking-wider">Total Klaim</span>
 <span class="text-xl font-black text-amber-300 font-mono">Rp ${totalKlaim.toLocaleString("id-ID")}</span>
 </div>
 </div>

 <!-- TABEL RINCIAN PERJALANAN -->
 <div class="overflow-x-auto border border-slate-200 rounded-2xl shadow-sm bg-white">
 <table class="w-full text-left border-collapse min-w-[750px]">
 <thead>
 <tr class="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
 <th class="p-2.5 text-center w-8">No</th>
 <th class="p-2.5">Tanggal</th>
 <th class="p-2.5 text-right">KM Awal</th>
 <th class="p-2.5 text-right">KM Akhir</th>
 <th class="p-2.5 text-right">Jarak</th>
 <th class="p-2.5 text-right">Petrol (Rp)</th>
 <th class="p-2.5 text-right">Parkir (Rp)</th>
 <th class="p-2.5 text-right">Denda (Rp)</th>
 <th class="p-2.5">Tujuan / Lokasi Kunjungan</th>
 <th class="p-2.5 text-right bg-slate-200/60 font-bold">Total Baris</th>
 </tr>
 </thead>
 <tbody>
 ${rowsHtml}
 </tbody>
 <tfoot class="bg-slate-50 font-bold text-slate-800 border-t-2 border-slate-200 text-xs">
 <tr>
 <td colspan="4" class="p-3 text-right uppercase tracking-wide">TOTAL REKAP:</td>
 <td class="p-3 text-right font-mono text-slate-900">${totalKm} KM</td>
 <td class="p-3 text-right font-mono">Rp ${totalPetrol.toLocaleString("id-ID")}</td>
 <td class="p-3 text-right font-mono">Rp ${totalParkir.toLocaleString("id-ID")}</td>
 <td class="p-3 text-right font-mono text-red-600">Rp ${totalDenda.toLocaleString("id-ID")}</td>
 <td></td>
 <td class="p-3 text-right font-mono text-sm text-maroon-700 bg-amber-50">Rp ${totalKlaim.toLocaleString("id-ID")}</td>
 </tr>
 </tfoot>
 </table>
 </div>

 <!-- ACTION PRINT FORM KLAIM -->
 <div class="flex items-center justify-between p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
 <div class="text-xs text-amber-900">
 <p class="font-bold">Formulir Klaim Bensin Resmi CV Andela Jaya</p>
 <p class="text-[11px] text-amber-700">Cetak/unduh form fisik ini untuk diserahkan ke HRD & Kasir Cabang.</p>
 </div>
 <button type="button" onclick="window.printSalesKlaimForm(${rowJson})" class="px-4 py-2 bg-maroon-700 hover:bg-maroon-800 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center gap-1.5 shrink-0">
 <span>Cetak / Download Form Klaim</span>
 </button>
 </div>
 </div>
 `;
 }

   const isCutiForm = row.form_id === "F-ISO-CUTI" || (row.nama_form || "").toLowerCase().includes("cuti") || !!row.kategori_cuti;
  const isPotongGaji = row.is_potong_gaji || row.potong_gaji || detail.is_potong_gaji || (row.kategori_cuti || "").includes("Potong Gaji");
  const potongHari = row.potong_gaji_hari || detail.potong_gaji_hari || row.jumlah_hari || 1;

  if (isCutiForm && (row.status_final || "").includes("APPROVED")) {
    const rowJson = escapeHtml(JSON.stringify(row));
    const sesi = row.sesi_cuti || detail.sesi_cuti || "";
    const jamOut = row.waktu_keluar || detail.jam_keluar || "";
    const jamIn = row.waktu_masuk || detail.jam_masuk || detail.jam_kembali || "";
    return `
    <div class="space-y-4">
      ${isPotongGaji ? `
      <div class="p-3 bg-rose-50 border border-rose-300 rounded-xl flex items-start gap-2.5 text-rose-950">
        <div class="p-1.5 bg-rose-100 rounded-lg text-rose-700 shrink-0 mt-0.5">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        </div>
        <div>
          <span class="font-bold uppercase block text-rose-900">Perhatian: Cuti Potong Gaji (Unpaid Leave)</span>
          <span class="text-[11px] block mt-0.5 text-rose-800 font-medium leading-relaxed">
            Pengajuan cuti ini memotong gaji sebanyak <b>${potongHari} Hari Kerja</b> karena jatah cuti habis/tidak mencukupi.
          </span>
        </div>
      </div>` : ""}

      <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
        <div class="flex justify-between items-center"><span class="text-slate-500 font-medium">Pemohon:</span><span class="font-bold text-slate-800">${escapeHtml(row.nama_pemohon)}</span></div>
        <div class="flex justify-between items-center"><span class="text-slate-500 font-medium">Jenis Cuti:</span><span class="font-bold text-slate-800">${escapeHtml(row.kategori_cuti || row.jenis_cuti || detail.jenis_cuti || "Cuti")}${sesi ? ` (${escapeHtml(sesi)})` : ""}</span></div>
        <div class="flex justify-between items-center"><span class="text-slate-500 font-medium">Tanggal:</span><span class="font-bold text-slate-800">${fmtDateShort(row.tanggal_mulai || detail.tanggal_mulai || row.tgl)} s/d ${fmtDateShort(row.tanggal_selesai || detail.tanggal_akhir || row.tgl)} (${row.jumlah_hari || detail.jumlah_hari || 1} Hari)</span></div>
        ${jamOut ? `<div class="flex justify-between items-center"><span class="text-slate-500 font-medium">Jam Cuti:</span><span class="font-bold text-slate-800">${escapeHtml(jamOut)} s/d ${escapeHtml(jamIn)}</span></div>` : ""}
        <div class="flex justify-between items-center"><span class="text-slate-500 font-medium">Alasan:</span><span class="font-semibold text-slate-700">${escapeHtml(row.alasan || detail.alasan || "-")}</span></div>
      </div>

      <div class="flex items-center justify-between p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
        <div class="text-xs text-emerald-900">
          <p class="font-bold">Formulir Cuti Fisik Resmi (Form HR4)</p>
          <p class="text-[11px] text-emerald-700">Pengajuan ini telah Full Approved. Cetak / unduh dokumen fisik resmi untuk arsip HRD.</p>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" onclick="window.downloadFormCutiPdf(${rowJson})" class="px-3.5 py-2 bg-maroon-700 hover:bg-maroon-800 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center gap-1.5 shrink-0">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <span>Download PDF</span>
          </button>
          <button type="button" onclick="window.printFormCutiFisik(${rowJson})" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-lg shadow-sm transition flex items-center gap-1 shrink-0">
            <span>Cetak</span>
          </button>
        </div>
      </div>
    </div>
    `;
  }

 // Generic detail formatter
 const itemsHtml = Object.entries(detail).map(([k, v]) => {
 const formattedKey = escapeHtml(k.replace(/_/g, " ").toUpperCase());

 const isAttachmentKey = /lampiran|file|foto|bukti|pdf|url|doc/i.test(k);
 const isUrl = typeof v === "string" && (/^https?:\/\//i.test(v) || v.startsWith("data:"));

 if (isAttachmentKey || isUrl) {
 if (v) {
 return `
 <div class="flex items-center justify-between py-2.5 border-b border-slate-100 text-xs">
 <span class="font-semibold text-slate-500">${formattedKey}</span>
 <button type="button" onclick="openAttachment('${escapeHtml(String(v))}')" class="px-3 py-1.5 bg-maroon-50 text-maroon-700 hover:bg-maroon-100 border border-maroon-200 rounded-lg font-bold text-xs transition flex items-center gap-1">
 <span>Lihat Lampiran</span>
 </button>
 </div>`;
 }
 return `
 <div class="flex items-center justify-between py-2 border-b border-slate-100 text-xs">
 <span class="font-semibold text-slate-500">${formattedKey}</span>
 <span class="text-slate-400 italic">Tidak ada lampiran</span>
 </div>`;
 }

 if (Array.isArray(v)) {
 if (v.length > 0 && typeof v[0] === 'object') {
 const headers = Object.keys(v[0]);
 let tableHtml = `<div class="overflow-x-auto mt-2 border border-slate-200 rounded-xl bg-white shadow-sm"><table class="w-full text-xs text-left border-collapse"><thead class="bg-slate-50 border-b border-slate-200"><tr>`;
 headers.forEach(h => tableHtml += `<th class="p-2 font-bold text-slate-600 uppercase text-[10px]">${escapeHtml(h.replace(/_/g, " "))}</th>`);
 tableHtml += `</tr></thead><tbody class="divide-y divide-slate-100">`;
 v.forEach(itemObj => {
 tableHtml += `<tr>`;
 headers.forEach(h => {
 let val = itemObj[h];
 if (typeof val === 'number' && /total|biaya|harga|nominal|parkir|denda/i.test(h)) val = "Rp " + val.toLocaleString("id-ID");
 tableHtml += `<td class="p-2 text-slate-700 font-medium">${escapeHtml(String(val || '-'))}</td>`;
 });
 tableHtml += `</tr>`;
 });
 tableHtml += `</tbody></table></div>`;
 return `<div class="py-2 border-b border-slate-100"><span class="font-semibold text-slate-500 text-xs">${formattedKey}</span>${tableHtml}</div>`;
 }
 return `<div class="flex justify-between py-2 border-b border-slate-100 text-xs"><span class="font-semibold text-slate-500">${formattedKey}</span><span class="font-bold text-slate-800">${escapeHtml(v.join(", "))}</span></div>`;
 }

 if (typeof v === "number" && /total|biaya|harga|nominal|kasbon|pinjaman/i.test(k)) {
 return `<div class="flex justify-between py-2 border-b border-slate-100 text-xs"><span class="font-semibold text-slate-500">${formattedKey}</span><span class="font-bold text-slate-800 font-mono text-sm">Rp ${v.toLocaleString("id-ID")}</span></div>`;
 }

 return `<div class="flex justify-between py-2 border-b border-slate-100 text-xs"><span class="font-semibold text-slate-500">${formattedKey}</span><span class="font-bold text-slate-800">${escapeHtml(String(v ?? "-"))}</span></div>`;
 }).join("");

 return `<div class="space-y-1 text-left">${itemsHtml}</div>`;
}

// Standarisasi Template Email HTML untuk Seluruh Notifikasi & Pengingat HRIS CV Andela Jaya
export function buildStandardEmailHtml(opts = {}) {
  const compName = opts.headerTitle || COMPANY_NAME || "CV ANDELA JAYA";
  const subtitle = opts.headerSubtitle || "Human Resource Information System (HRIS)";
  const badge = opts.badgeText ? String(opts.badgeText).trim() : "";
  const title = opts.title ? String(opts.title).trim() : "";
  const recipientName = opts.recipientName ? String(opts.recipientName).trim() : "";
  const introText = opts.introText ? String(opts.introText).trim() : "";
  const bodyHtml = opts.bodyHtml || "";
  const infoList = Array.isArray(opts.infoList) ? opts.infoList.filter(item => item && item.label) : [];
  const actionUrl = opts.actionUrl ? String(opts.actionUrl).trim() : "";
  const actionText = opts.actionText || "Buka Portal HRIS →";
  const secondaryNote = opts.secondaryNote ? String(opts.secondaryNote).trim() : "";
  const footerCustom = opts.footerText ? String(opts.footerText).trim() : "";
  const includeTimestamp = opts.includeTimestamp !== false;

  // Badge styling
  let badgeHtml = "";
  if (badge) {
    let bg = "rgba(255, 255, 255, 0.2)";
    let border = "rgba(255, 255, 255, 0.35)";
    let color = "#ffffff";
    const v = (opts.badgeVariant || "maroon").toLowerCase();
    if (v === "green" || v === "emerald" || v === "approved") {
      bg = "rgba(16, 185, 129, 0.2)";
      border = "rgba(16, 185, 129, 0.4)";
      color = "#6ee7b7";
    } else if (v === "amber" || v === "yellow" || v === "warning" || v === "pending") {
      bg = "rgba(245, 158, 11, 0.25)";
      border = "rgba(245, 158, 11, 0.45)";
      color = "#fde68a";
    } else if (v === "rose" || v === "red" || v === "danger" || v === "rejected") {
      bg = "rgba(244, 63, 94, 0.25)";
      border = "rgba(244, 63, 94, 0.45)";
      color = "#fecdd3";
    } else if (v === "blue" || v === "info") {
      bg = "rgba(59, 130, 246, 0.25)";
      border = "rgba(59, 130, 246, 0.45)";
      color = "#bfdbfe";
    } else if (v === "purple" || v === "anniv") {
      bg = "rgba(168, 85, 247, 0.25)";
      border = "rgba(168, 85, 247, 0.45)";
      color = "#e9d5ff";
    }
    badgeHtml = `
      <div style="margin-top: 10px;">
        <span style="display: inline-block; background-color: ${bg}; border: 1px solid ${border}; color: ${color}; font-size: 11px; font-weight: bold; letter-spacing: 0.8px; text-transform: uppercase; padding: 3px 12px; border-radius: 9999px;">
          ${escapeHtml(badge)}
        </span>
      </div>
    `;
  }

  // Info list box
  let infoBoxHtml = "";
  if (infoList.length > 0) {
    const rows = infoList.map(item => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 8px 10px; color: #64748b; font-size: 12.5px; width: 35%; vertical-align: top; font-weight: 500;">
          ${escapeHtml(String(item.label))}
        </td>
        <td style="padding: 8px 10px; color: #0f172a; font-size: 13px; vertical-align: top; font-weight: 600;">
          ${item.isHtml ? item.value : escapeHtml(String(item.value ?? "-"))}
        </td>
      </tr>
    `).join("");

    infoBoxHtml = `
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #7a1f2b; border-radius: 8px; padding: 14px 16px; margin: 18px 0;">
        ${opts.infoBoxTitle ? `<h4 style="margin: 0 0 10px 0; color: #7a1f2b; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(opts.infoBoxTitle)}</h4>` : ""}
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  // Status Box
  let statusBoxHtml = "";
  if (opts.statusBox) {
    statusBoxHtml = `<div style="margin: 16px 0;">${opts.statusBox}</div>`;
  }

  // CTA Button
  let ctaHtml = "";
  if (actionUrl) {
    ctaHtml = `
      <div style="text-align: center; margin: 26px 0 14px 0;">
        <a href="${actionUrl}" target="_blank" rel="noopener" style="display: inline-block; background-color: #7a1f2b; color: #ffffff; font-weight: bold; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 13.5px; box-shadow: 0 3px 6px -1px rgba(122, 31, 43, 0.3); letter-spacing: 0.3px;">
          ${escapeHtml(actionText)}
        </a>
      </div>
      ${secondaryNote ? `<p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 6px 0 0 0; line-height: 1.4;">${secondaryNote}</p>` : `
        <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 6px 0 0 0; line-height: 1.4;">
          Jika tombol di atas tidak dapat diklik, salin tautan berikut ke peramban Anda:<br/>
          <a href="${actionUrl}" style="color: #7a1f2b; text-decoration: underline; word-break: break-all;">${escapeHtml(actionUrl)}</a>
        </p>
      `}
    `;
  }

  // Timestamp string
  const timeNow = new Date().toLocaleString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  });

  return `
    <div style="background-color: #f1f5f9; padding: 24px 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #334155; line-height: 1.6;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); border-collapse: separate;">
        <!-- Header Resmi CV ANDELA JAYA -->
        <tr>
          <td style="background: linear-gradient(135deg, #7a1f2b 0%, #4a0e17 100%); color: #ffffff; padding: 26px 24px; text-align: center;">
            <h2 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase;">
              ${escapeHtml(compName)}
            </h2>
            <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.9; letter-spacing: 0.5px; text-transform: uppercase;">
              ${escapeHtml(subtitle)}
            </p>
            ${badgeHtml}
          </td>
        </tr>

        <!-- Main Body -->
        <tr>
          <td style="padding: 28px 24px; background-color: #ffffff;">
            ${title ? `
              <h3 style="margin: 0 0 16px 0; color: #0f172a; font-size: 16.5px; font-weight: 700; line-height: 1.4; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
                ${escapeHtml(title)}
              </h3>
            ` : ""}

            ${recipientName ? `
              <p style="margin: 0 0 14px 0; font-size: 14px; color: #1e293b; line-height: 1.6;">
                Halo <strong>${escapeHtml(recipientName)}</strong>,
              </p>
            ` : ""}

            ${introText ? `
              <p style="margin: 0 0 16px 0; font-size: 13.5px; color: #334155; line-height: 1.6;">
                ${escapeHtml(introText)}
              </p>
            ` : ""}

            ${infoBoxHtml}
            ${statusBoxHtml}
            ${bodyHtml}
            ${ctaHtml}
          </td>
        </tr>

        <!-- Footer Resmi -->
        <tr>
          <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; text-align: center; font-size: 11.5px; color: #64748b; line-height: 1.5;">
            ${footerCustom ? `<div>${footerCustom}</div>` : `
              <div style="font-weight: 600; color: #475569; margin-bottom: 2px;">
                Sistem Informasi Manajemen SDM & Operasional — ${escapeHtml(compName)}
              </div>
              <div style="color: #94a3b8;">
                Email ini dikirim secara otomatis oleh sistem. Harap tidak membalas email ini secara langsung.
              </div>
            `}
            ${includeTimestamp ? `
              <div style="margin-top: 6px; font-size: 10.5px; color: #cbd5e1;">
                Waktu Pengiriman: ${escapeHtml(timeNow)}
              </div>
            ` : ""}
          </td>
        </tr>
      </table>
    </div>
  `;
}

export async function sendEmailNotif(to, subject, htmlBody, cc = "") {
 if (!to) {
 console.warn("sendEmailNotif: Alamat email tujuan tidak ditentukan.");
 return false;
 }
 const targetTo = Array.isArray(to) ? to.join(",") : String(to);
 if (!targetTo.trim()) return false;

 // Pastikan email body seragam dengan standard template Andela Jaya jika belum dibungkus
 let formattedHtml = htmlBody;
 if (typeof formattedHtml === "string") {
   const isAlreadyFullTemplate = formattedHtml.includes("linear-gradient(135deg, #7a1f2b") || formattedHtml.includes("CV ANDELA JAYA") || formattedHtml.includes("Header Resmi CV ANDELA JAYA");
   if (!isAlreadyFullTemplate) {
     formattedHtml = buildStandardEmailHtml({
       title: subject,
       bodyHtml: formattedHtml
     });
   }
 }

 // Catat ke Firestore 'mail' collection (opsional, hanya berguna jika
 // extension Firebase "Trigger Email" terpasang di project ini)
 try {
 const toArray = Array.isArray(to) ? to : targetTo.split(",").map(s => s.trim()).filter(Boolean);
 fsAdd("mail", {
 to: toArray,
 message: { subject: subject, html: formattedHtml },
 created_at: new Date().toISOString()
 }).catch(err => console.warn("Note: Write to Firebase mail collection queued:", err?.message));
 } catch (e) {}

 // Kirim lewat endpoint server sendiri (/api/send-email, pakai Resend) —
 // BUKAN lagi lewat Google Apps Script, karena jalur GAS sebelumnya tidak
 // pernah benar-benar mengecek apakah pengiriman berhasil atau gagal.
 try {
 const res = await fetch("/api/send-email", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ to: targetTo, subject, htmlBody: formattedHtml, cc })
 });

 let json;
 try {
 json = await res.json();
 } catch {
 console.error("sendEmailNotif: respons /api/send-email bukan JSON valid.");
 return false;
 }

 if (!res.ok || json?.success !== true) {
 console.error("sendEmailNotif GAGAL:", json?.error || `HTTP ${res.status}`);
 return false;
 }

 console.log("Email berhasil dikirim via Resend. ID:", json.id);
 return true;

 } catch (error) {
 console.error("sendEmailNotif: gagal menghubungi /api/send-email.", error?.message || error);
 return false;
 }
}

let _html2PdfLoadingPromise = null;
export function ensureHtml2PdfLoaded() {
 if (window.html2pdf) return Promise.resolve();
 if (_html2PdfLoadingPromise) return _html2PdfLoadingPromise;
 _html2PdfLoadingPromise = new Promise((resolve, reject) => {
 const script = document.createElement("script");
 script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
 script.onload = () => resolve();
 script.onerror = () => reject(new Error("Gagal memuat library PDF (html2pdf)."));
 document.head.appendChild(script);
 });
 return _html2PdfLoadingPromise;
}

export async function downloadHtmlAsPdf(htmlContent, filename = "document.pdf", orientation = "portrait") {
 await ensureHtml2PdfLoaded();
 const isLandscape = orientation === "landscape";
 
 // Standard A4 dimensions in px at 96 DPI:
 // Portrait: 210mm = 794px
 // Landscape: 297mm = 1122px
 const widthPx = isLandscape ? 1080 : 750;

 const prevScrollX = window.scrollX;
 const prevScrollY = window.scrollY;

 // PENTING -- AKAR PENYEBAB UTAMA "PDF blank/halaman kosong":
 // html2canvas (dipakai html2pdf.js) mengukur elemen sumber via
 // getBoundingClientRect() pada elemen HASIL CLONE di dalam iframe
 // tersembunyi. Untuk elemen ber-"position: fixed" (atau "absolute"),
 // pengukuran ini SERING menghasilkan tinggi = 0 di clone tsb -- sudah
 // dibuktikan lewat reproduksi nyata (headless Chrome + html2pdf.js
 // versi yang sama persis dipakai produksi): elemen "position:fixed"
 // maupun "position:absolute" SELALU menghasilkan kanvas 0px tinggi
 // ("...x0"), sedangkan "position:static/relative" (mengikuti alur
 // dokumen normal) selalu menghasilkan tinggi yang benar. Ini penyebab
 // dokumen "kadang gagal / blank" -- BUKAN soal gambar belum termuat.
 //
 // Solusi: elemen konten (`element`) dibuat NORMAL/IN-FLOW
 // ("position: static"), lalu dibungkus `wrapper` ber-ukuran 0x0 +
 // overflow:hidden + position:fixed supaya tetap 100% tidak terlihat
 // & tidak mengganggu scroll/layout halaman yang sedang aktif -- tapi
 // elemen konten di dalamnya tetap "in-flow" sehingga terukur benar
 // oleh html2canvas.
 const wrapper = document.createElement("div");
 wrapper.style.position = "fixed";
 wrapper.style.left = "0px";
 wrapper.style.top = "0px";
 wrapper.style.width = widthPx + "px";
 wrapper.style.height = "auto";
 wrapper.style.overflow = "visible";
 wrapper.style.zIndex = "-99999";
 wrapper.style.opacity = "0";
 wrapper.style.pointerEvents = "none";

 const element = document.createElement("div");
 element.style.position = "static";
 element.style.width = widthPx + "px";
 element.style.padding = "0px";
 element.style.margin = "0px";
 element.style.background = "#ffffff";
 element.style.color = "#000000";
 element.style.fontFamily = "'Times New Roman', Times, serif";
 element.style.boxSizing = "border-box";
 element.innerHTML = htmlContent;
	element.querySelectorAll(".no-print-bar, .no-print, button.btn-cetak, [data-no-print]").forEach(el => el.remove());

  wrapper.appendChild(element);
  document.body.appendChild(wrapper);

  // 1. Konversi semua URL gambar (Google Drive, HTTPS, dll.) ke Base64 Data URL
  // agar html2canvas dapat merender gambar ke PDF tanpa terhalang CORS & onerror
  async function convertImagesToDataUrls(container, timeoutMs = 8000) {
    const imgs = Array.from(container.querySelectorAll("img"));
    if (imgs.length === 0) return;

    const tasks = imgs.map(async (img) => {
      const rawSrc = img.getAttribute("src") || img.src || "";
      if (!rawSrc || rawSrc.startsWith("data:image/") || rawSrc.startsWith("blob:")) return;

      try {
        // Coba proxy server lokal yang mem-bypass CORS & mendukung link Google Drive
        const proxyUrl = `/api/proxy-image?format=base64&url=${encodeURIComponent(rawSrc)}`;
        const res = await fetch(proxyUrl);
        if (res.ok) {
          const data = await res.json();
          if (data && data.dataUrl) {
            img.src = data.dataUrl;
            img.removeAttribute("crossorigin");
            img.removeAttribute("onerror");
            return;
          }
        }
      } catch (e) {
        // Fallback jika fetch proxy gagal
      }

      try {
        // Coba direct CORS fetch -> blob -> Base64
        const directRes = await fetch(rawSrc, { mode: "cors" });
        if (directRes.ok) {
          const blob = await directRes.blob();
          const b64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          if (b64) {
            img.src = b64;
            img.removeAttribute("crossorigin");
            img.removeAttribute("onerror");
          }
        }
      } catch (e) {}
    });

    await Promise.race([
      Promise.all(tasks),
      new Promise((resolve) => setTimeout(resolve, timeoutMs))
    ]);
  }

  await convertImagesToDataUrls(element);

  // 2. Tunggu semua gambar siap dimuat
  async function waitForImages(container, timeoutMs = 8000) {
    const imgs = Array.from(container.querySelectorAll("img"));
    if (imgs.length === 0) return;

    const perImage = imgs.map((img) => new Promise((resolve) => {
      if (img.complete && img.naturalWidth > 0) { resolve(); return; }
      const done = () => resolve();
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", () => {
        console.warn("Gambar gagal dimuat saat generate PDF:", img.src);
        resolve();
      }, { once: true });
    }));

    await Promise.race([
      Promise.all(perImage),
      new Promise((resolve) => setTimeout(resolve, timeoutMs))
    ]);
  }

  await waitForImages(element);
  await new Promise((resolve) => setTimeout(resolve, 200));

 const opt = {
 margin: isLandscape ? [5, 5, 5, 5] : [5, 5, 5, 5], // top, left, bottom, right in mm
 filename: filename,
 image: { type: 'jpeg', quality: 0.98 },
 html2canvas: { 
 scale: 2, 
 useCORS: true, 
 logging: false,
 backgroundColor: "#ffffff",
 width: widthPx,
 windowWidth: widthPx,
 scrollX: 0,
 scrollY: 0,
 x: 0,
 y: 0
 },
 jsPDF: { unit: 'mm', format: 'a4', orientation: orientation },
 pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
 };

 try {
 await window.html2pdf().from(element).set(opt).save();
 } catch (err) {
 console.error("Gagal men-generate PDF:", err);
 throw err;
 } finally {
 if (wrapper.parentNode) {
 wrapper.parentNode.removeChild(wrapper);
 }
 window.scrollTo(prevScrollX, prevScrollY);
 }
}

export async function sendFCMNotif(tokens, title, body, link = "") {
 const list = (Array.isArray(tokens) ? tokens : [tokens]).filter(Boolean);
 if (!list.length) return false;
 
 // Ambil nama domain otomatis (contoh: https://hris.andelajaya.com)
 const baseUrl = window.location.origin;
 const targetLink = link ? (baseUrl + link) : baseUrl;

 try {
 const res = await fetch("/api/send-push", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 // Kirim targetLink ke Vercel
 body: JSON.stringify({ tokens: list, title, body, link: targetLink }) 
 });
 
 return res.ok;
 } catch (e) {
 console.error("Gagal mengirim notif: ", e.message);
 return false;
 }
}

/* ---------------------------------------------------------------------
 * NOTIFICATION DEDUPARATION ENGINE & PUSH/EMAIL NOTIFIERS
 * Prevent double/duplicate notifications across all modules
 * ------------------------------------------------------------------- */
const recentNotifsMap = new Map();

function isDuplicateNotification(targetKey, judul, pesan, link = "") {
 const now = Date.now();
 for (const [k, time] of recentNotifsMap.entries()) {
 if (now - time > 15000) recentNotifsMap.delete(k);
 }
 const cleanTarget = String(targetKey || "").trim().toLowerCase();
 const cleanJudul = String(judul || "").trim().toLowerCase();
 const cleanPesan = String(pesan || "").trim().toLowerCase();
 const cleanLink = String(link || "").trim().toLowerCase();
 const hashKey = `${cleanTarget}::${cleanJudul}::${cleanPesan}::${cleanLink}`;
 if (recentNotifsMap.has(hashKey)) {
 return true;
 }
 recentNotifsMap.set(hashKey, now);
 return false;
}

/**
 * Helper terpadu utk 1 target user: menulis notif lonceng (in-app) +
 * mengirim push ke HP-nya sekaligus, berdasar fcm_token yg tersimpan
 * di dokumen Users. Dipakai di seluruh modul yg butuh notif per-orang.
 */
export async function notifyUser(username, judul, pesan, link = "", opts = {}) {
 // Normalize if 2nd argument was passed as an options/payload object
 if (typeof judul === "object" && judul !== null) {
  const payload = judul;
  opts = Object.assign({}, payload, opts);
  judul = payload.judul || payload.title || payload.subject || "Pemberitahuan HRIS";
  pesan = payload.pesan || payload.message || payload.body || "";
  link = payload.link || payload.url || link || "";
 } else {
  judul = String(judul || "Pemberitahuan HRIS");
  pesan = String(pesan || "");
  link = String(link || "");
 }

 // opts.sendEmail (default true): dipakai HRD untuk menonaktifkan email
 // pada kasus tertentu (mis. pengambilan ATK) tanpa menghilangkan
 // notifikasi in-app (lonceng) & push HP yang tetap perlu tampil.
 const sendEmail = opts.sendEmail !== false;
 if (!username) return;
 let targetEmail = (typeof username === "object" && username.email) ? username.email : null;
 let targetName = (typeof username === "object" && username.nama) ? username.nama : null;
 let targetNik = (typeof username === "object" && username.nik) ? username.nik : null;
 const rawTarget = typeof username === "object" ? (username.username || username.nama || username.id) : username;
 if (!rawTarget) return;

 const targetStr = String(rawTarget).trim();
 const targetLower = targetStr.toLowerCase();
 if (!targetEmail && targetStr.includes("@")) {
 targetEmail = targetStr;
 }
 if (!targetName) targetName = targetStr;

 const dedupKey = targetEmail || targetStr || targetName;
 if (isDuplicateNotification(dedupKey, judul, pesan, link)) {
 console.warn("[notifyUser] Notifikasi terdeteksi duplikat, dilewati:", dedupKey, judul);
 return;
 }

 try {
 const tokens = new Set();
 let resolvedUsername = targetStr;
 let resolvedNik = targetNik || targetStr;

 // Search USERS doc directly by ID
 let snap = await getDoc(doc(db, COL.USERS, String(rawTarget))).catch(() => null);
 if (snap && snap.exists()) {
 const uData = snap.data();
 targetName = uData.nama || targetName;
 resolvedUsername = uData.username || snap.id || resolvedUsername;
 resolvedNik = uData.nik || resolvedNik;
 if (Array.isArray(uData.fcm_tokens)) uData.fcm_tokens.forEach(t => t && tokens.add(t));
 if (uData.fcm_token) tokens.add(uData.fcm_token); // kompatibilitas data lama
 if (uData.email && !targetEmail) targetEmail = uData.email;
 }

 // Query USERS by username, nama, or nik
 try {
 const qUsers = query(collection(db, COL.USERS));
 const snapUsers = await getDocs(qUsers);
 snapUsers.docs.forEach(d => {
 const uData = d.data();
 const dId = d.id;
 const uName = (uData.username || dId || "").trim();
 const uNama = (uData.nama || "").trim();
 const uNik = (uData.nik || "").trim();

 const matches = dId.toLowerCase() === targetLower ||
 uName.toLowerCase() === targetLower ||
 (uNama && uNama.toLowerCase() === targetLower) ||
 (uNik && uNik.toLowerCase() === targetLower);
 if (matches) {
 if (uName) resolvedUsername = uName;
 if (uNama && !targetName) targetName = uNama;
 if (uNik) resolvedNik = uNik;
 if (Array.isArray(uData.fcm_tokens)) uData.fcm_tokens.forEach(t => t && tokens.add(t));
 if (uData.fcm_token) tokens.add(uData.fcm_token); // kompatibilitas data lama
 if (uData.email && !targetEmail) targetEmail = uData.email;
 }
 });
 } catch (e) {}

 // Query MASTER_KARYAWAN by nama_karyawan, nik, or id
 try {
 const qK = query(collection(db, COL.MASTER_KARYAWAN));
 const snapK = await getDocs(qK);
 snapK.docs.forEach(d => {
 const kData = d.data();
 const kNama = (kData.nama_karyawan || kData.nama || "").trim();
 const kNik = (kData.nik_karyawan || kData.nik || "").trim();

 const matches = d.id.toLowerCase() === targetLower ||
 (kNik && kNik.toLowerCase() === targetLower) ||
 (kNama && kNama.toLowerCase() === targetLower) ||
 (targetName && kNama && kNama.toLowerCase() === targetName.toLowerCase());
 if (matches) {
 if (kNama && !targetName) targetName = kNama;
 if (kNik) resolvedNik = kNik;
 if (Array.isArray(kData.fcm_tokens)) kData.fcm_tokens.forEach(t => t && tokens.add(t));
 if (kData.fcm_token) tokens.add(kData.fcm_token); // kompatibilitas data lama
 if (kData.email && !targetEmail) targetEmail = kData.email;
 }
 });
 } catch (e) {}

 // 1. In-App Notification (lonceng)
 // Paksa jadi string dulu -- field 'nik'/'username'/'nama' di Firestore kadang
 // tersimpan sebagai Number (mis. hasil migrasi Excel), yang akan bikin
 // .toLowerCase() crash kalau dipanggil langsung di atas tipe Number.
 const safeUsername = String(resolvedUsername ?? "").trim();
 const safeName = String(targetName ?? "").trim();
 const safeNik = String(resolvedNik ?? "").trim();

 const notifPayload = {
 username_target: safeUsername,
 nama_target: safeName,
 nik_target: safeNik,
 target_aliases: Array.from(new Set([targetStr, targetLower, safeUsername, safeUsername.toLowerCase(), safeName, safeName.toLowerCase(), safeNik, safeNik.toLowerCase()])).filter(Boolean),
 judul,
 pesan,
 link: link || "",
 dibaca: false,
 tanggal: new Date().toISOString()
 };
 await fsAdd(COL.NOTIFICATIONS, notifPayload, genId("NTF"));

 // 2. Send Push Notification via FCM
 const tokenList = Array.from(tokens).filter(Boolean);
 if (tokenList.length > 0) {
 await sendFCMNotif(tokenList, judul, pesan, link).catch(e => console.warn("FCM push error:", e));
 }

 // 3. Send Email (bisa dinonaktifkan lewat opts.sendEmail = false,
 // mis. untuk pengambilan ATK yang tidak perlu notifikasi email)
 if (targetEmail && sendEmail) {
 const appUrl = window.location.origin;
 let magicToken = "";
 if (resolvedUsername) {
 try { magicToken = await createLoginToken(resolvedUsername); } catch (e) {}
 }
 
 let routePath = link || "";
 if (routePath.startsWith('/')) routePath = routePath.substring(1);
 if (!routePath.startsWith('#')) routePath = '#' + routePath;

 const targetLink = magicToken 
 ? `${appUrl}/${routePath}${routePath.includes('?') ? '&' : '?'}token=${magicToken}`
 : `${appUrl}/${routePath}`;

 const htmlBody = buildStandardEmailHtml({
   title: judul,
   recipientName: targetName,
   badgeText: "Notifikasi Sistem",
   badgeVariant: "maroon",
   introText: pesan,
   actionUrl: targetLink,
   actionText: "Buka HRIS & Lihat Rincian →",
   secondaryNote: "Pesan ini dibuat otomatis oleh Sistem Portal HRIS & Operasional CV Andela Jaya."
 });
 await sendEmailNotif(targetEmail, `[HRIS Update] ${judul}`, htmlBody);
 }
 } catch (e) {
 console.warn("Gagal mengirim notifikasi ke " + rawTarget, e);
 }
}

export async function createLoginToken(username) {
 const token = genId("TKN") + "-" + Math.random().toString(36).slice(2, 10);
 await fsAdd("login_tokens", {
 username: username, used: false, createdAt: Date.now()
 }, token);
 return token;
}

export async function getTargetsForRole(role, namaKaryawan = "") {
 try {
 const roleUpper = (role || "").toUpperCase().trim();
 const cleanNama = (namaKaryawan || "").trim().toLowerCase();

 const allUsers = await fsGetAll(COL.USERS).catch(() => []);
 const allEmployees = await fsGetAll(COL.MASTER_KARYAWAN).catch(() => []);

 const enrichTarget = (u) => {
 if (!u) return null;
 const uId = u.username || u.id || u.nik;
 const uNama = u.nama || u.nama_karyawan || u.username || uId;
 let email = u.email || "";
 let nik = u.nik || u.nik_karyawan || "";

 const empMatch = allEmployees.find(k => 
 (k.nik_karyawan || k.nik || "").toString().toLowerCase() === String(nik).toLowerCase() ||
 (k.nama_karyawan || k.nama || "").trim().toLowerCase() === String(uNama).trim().toLowerCase() ||
 (k.id || "").toString().toLowerCase() === String(uId).toLowerCase() ||
 (k.username || "").toString().toLowerCase() === String(uId).toLowerCase()
 );
 if (empMatch) {
 if (!email && empMatch.email) email = empMatch.email;
 if (!nik && (empMatch.nik_karyawan || empMatch.nik)) nik = empMatch.nik_karyawan || empMatch.nik;
 }

 return {
 username: u.username || uId,
 email: email || "",
 nama: uNama,
 nik: nik
 };
 };

 // 1. PEMOHON
 if (roleUpper === "PEMOHON" && cleanNama) {
 const uMatch = allUsers.find(u => 
 (u.nama || "").trim().toLowerCase() === cleanNama ||
 (u.username || "").trim().toLowerCase() === cleanNama
 );
 if (uMatch) {
 const enriched = enrichTarget(uMatch);
 if (enriched) return [enriched];
 }
 const kMatch = allEmployees.find(k => (k.nama_karyawan || k.nama || "").trim().toLowerCase() === cleanNama);
 if (kMatch) {
 return [{ username: kMatch.username || kMatch.id || kMatch.nik, email: kMatch.email || "", nama: kMatch.nama_karyawan || kMatch.nama, nik: kMatch.nik_karyawan || kMatch.nik }];
 }
 return [];
 }

 // 2. ATASAN
 if (roleUpper === "ATASAN" && cleanNama) {
 const kData = allEmployees.find(k => (k.nama_karyawan || k.nama || "").trim().toLowerCase() === cleanNama);
 let namaAtasan = kData ? (kData.atasan || kData.atasan_langsung || kData.atasan_1 || kData.nama_atasan || kData.head || "") : "";
 
 if (namaAtasan) {
 const cleanAtasan = namaAtasan.trim().toLowerCase();
 const uAtasan = allUsers.find(u => 
 (u.nama || "").trim().toLowerCase() === cleanAtasan ||
 (u.username || "").trim().toLowerCase() === cleanAtasan
 );
 if (uAtasan) return [enrichTarget(uAtasan)];

 const kAtasan = allEmployees.find(k => (k.nama_karyawan || k.nama || "").trim().toLowerCase() === cleanAtasan);
 if (kAtasan) {
 const matchedUser = allUsers.find(u => (u.nama || "").trim().toLowerCase() === cleanAtasan || (u.username || "").toLowerCase() === (kAtasan.username || kAtasan.id || "").toLowerCase());
 return [{
 username: matchedUser?.username || kAtasan.username || kAtasan.id || kAtasan.nik,
 email: matchedUser?.email || kAtasan.email || "",
 nama: kAtasan.nama_karyawan || kAtasan.nama,
 nik: kAtasan.nik_karyawan || kAtasan.nik
 }];
 }
 }

 // Kalau atasan spesifik tidak ditemukan, JANGAN broadcast ke siapa saja
 // yang kebetulan jabatannya mengandung kata manajerial (bisa kena banyak
 // orang tak terkait & bocorkan pengajuan pribadi). Fallback aman: HRD saja.
 const fallbackApprovers = allUsers.filter(u => {
 const r = (u.role || "").toUpperCase();
 return r === "HRD" || r.includes("HRD");
 });

 if (fallbackApprovers.length > 0) {
 return fallbackApprovers.map(enrichTarget).filter(Boolean);
 }
 }

 // 3. SPECIFIC ROLE (GM, HRD, FINANCE, MANAGER, SPV, etc.)
 const searchAliases = [roleUpper];
 if (roleUpper === "GM" || roleUpper === "GENERAL MANAGER") {
 searchAliases.push("GM", "GENERAL MANAGER");
 } else if (roleUpper === "HRD" || roleUpper === "HR") {
 searchAliases.push("HRD", "HR", "HUMAN RESOURCE", "ADMIN");
 } else if (roleUpper === "FINANCE" || roleUpper === "ACCOUNTING") {
 searchAliases.push("FINANCE", "ACCOUNTING", "KEUANGAN");
 } else if (roleUpper === "SPV" || roleUpper === "SUPERVISOR") {
 searchAliases.push("SPV", "SUPERVISOR");
 } else if (roleUpper === "MANAGER" || roleUpper === "MANAJER") {
 searchAliases.push("MANAGER", "MANAJER");
 }

 const matchedUsers = allUsers.filter(u => {
 const r = (u.role || "").toUpperCase();
 const p = (u.posisi || u.jabatan || "").toUpperCase();
 const un = (u.username || u.id || "").toUpperCase();
 const nm = (u.nama || "").toUpperCase();
 return searchAliases.some(alias => r === alias || r.includes(alias) || p.includes(alias) || un.includes(alias) || nm.includes(alias));
 });

 const matchedEmps = allEmployees.filter(k => {
 const j = (k.jabatan || k.role || k.posisi || "").toUpperCase();
 const nm = (k.nama_karyawan || k.nama || "").toUpperCase();
 return searchAliases.some(alias => j.includes(alias) || nm.includes(alias));
 });

 const targets = [];
 matchedUsers.forEach(u => {
 const t = enrichTarget(u);
 if (t) targets.push(t);
 });

 matchedEmps.forEach(k => {
 const kNama = (k.nama_karyawan || k.nama || "").trim().toLowerCase();
 const exists = targets.some(t => t.nama.toLowerCase() === kNama || (k.email && t.email.toLowerCase() === k.email.toLowerCase()));
 if (!exists) {
 const u = allUsers.find(user => (user.nama || "").trim().toLowerCase() === kNama || (user.username || "").toLowerCase() === (k.username || k.id || "").toLowerCase());
 targets.push({
 username: u?.username || k.username || k.id || k.nik_karyawan,
 email: u?.email || k.email || "",
 nama: k.nama_karyawan || k.nama,
 nik: k.nik_karyawan || k.nik
 });
 }
 });

 if (targets.length > 0) {
 return targets.filter((v, i, a) => a.findIndex(v2 => (v2.username && v2.username === v.username) || (v2.email && v2.email === v.email)) === i);
 }

 // Sama seperti fallback ATASAN di atas: kalau role spesifik (GM/Finance/
 // Manager/dst) tidak ketemu siapa pun, jangan sasar banyak role sekaligus.
 // Fallback aman: HRD saja.
 let fallbackUsers = allUsers.filter(u => (u.role || "").toUpperCase().includes("HRD"));

 return fallbackUsers.map(enrichTarget).filter(Boolean);

 } catch (error) {
 console.error("Error getTargetsForRole:", error);
 return [];
 }
}

/* ---------------------------------------------------------------------
 * PERHITUNGAN JATAH CUTI SESUAI SK No.018/HRGA-AJ/XII/2024
 * ------------------------------------------------------------------- */
export function getCarryoverPercentage(tanggalJoin, refDate = new Date()) {
  if (!tanggalJoin) return 0;
  const join = smartParseDate(tanggalJoin);
  if (!join || isNaN(join.getTime())) return 0;
  const ref = refDate instanceof Date ? refDate : new Date(refDate);
  const diffMonths = (ref.getFullYear() - join.getFullYear()) * 12 + (ref.getMonth() - join.getMonth());
  const tenureYears = diffMonths / 12;

  // Ketentuan Persentase Carryover Cuti Akumulasi berdasarkan Masa Kerja:
  // - 0 s/d di bawah 3 tahun (< 3 tahun): 0%
  // - 3 tahun s/d di bawah 5 tahun (3 <= tenure < 5): 50%
  // - 5 tahun ke atas (tenure >= 5): 100%
  if (tenureYears >= 5) {
    return 1.0;
  } else if (tenureYears >= 3) {
    return 0.5;
  } else {
    return 0;
  }
}

export function calculateCarryoverJatah(sisaCutiTahunLalu, tanggalJoin, refDate = new Date()) {
  const sisa = parseFloat(sisaCutiTahunLalu);
  if (isNaN(sisa) || sisa <= 0) return 0;
  const pct = getCarryoverPercentage(tanggalJoin, refDate);
  return Math.floor(sisa * pct);
}

/**
 * Mengklasifikasikan transaksi riwayat cuti ke kategori pemotongan jatah yang tepat:
 * - "Tahunan" (Cuti Tahunan, Cuti Setengah Hari, Cuti Bersama, Sakit tanpa surat dokter)
 * - "Khusus" (Cuti Khusus / Alasan Penting, e.g. Pernikahan, Melahirkan, Kematian, Khitanan)
 * - "Akumulasi" (Cuti Sisa / Carryover akumulasi tahun lalu)
 * - "Tidak Dipotong" (Sakit dgn Surat Dokter, Dinas Luar Kota, Cuti Besar)
 * - "Potong Gaji" (Unpaid Leave / Cuti Potong Gaji)
 */
export function getCutiDeductionCategory(r) {
  if (!r) return { category: "Tahunan", isDeducted: true, count: 1 };

  // 1. Deteksi Cuti Potong Gaji (Unpaid Leave)
  const isPotongGaji = Boolean(
    r.is_potong_gaji || 
    r.potong_gaji || 
    (r.detail && (r.detail.is_potong_gaji || r.detail.potong_gaji)) ||
    (r.potong_jatah && String(r.potong_jatah).toLowerCase().includes("gaji")) ||
    (r.tipe_potong && String(r.tipe_potong).toLowerCase().includes("gaji")) ||
    (r.type_cuti && String(r.type_cuti).toLowerCase().includes("potong gaji")) ||
    (r.kategori_cuti && String(r.kategori_cuti).toLowerCase().includes("potong gaji")) ||
    (r.jenis_cuti && String(r.jenis_cuti).toLowerCase().includes("potong gaji"))
  );
  if (isPotongGaji) {
    return { category: "Potong Gaji", isDeducted: false, count: 0 };
  }

  const potongRaw = String(r.potong_jatah || r.tipe_potong || "").trim().toLowerCase();
  const typeStr = String(
    r.type_cuti || 
    r.kategori_cuti || 
    r.jenis_cuti || 
    (r.detail && (r.detail.jenis_cuti || r.detail.kategori_cuti || r.detail.type_cuti)) || 
    ""
  ).trim().toLowerCase();

  // 2. Deteksi Tidak Dipotong (Sakit Surat Dokter, Dinas Luar Kota, Cuti Besar)
  if (
    potongRaw === "tidak dipotong" || 
    potongRaw.includes("tidak") || 
    potongRaw.includes("bebas") ||
    typeStr.startsWith("s -") || 
    typeStr.startsWith("s - ") ||
    (typeStr.includes("surat dokter") && !typeStr.includes("tanpa surat dokter")) ||
    typeStr.startsWith("d -") ||
    typeStr.startsWith("d - ") ||
    typeStr.includes("dinas") ||
    typeStr.startsWith("c-besar") ||
    typeStr.includes("cuti besar") ||
    typeStr.includes("umroh") ||
    typeStr.includes("haji")
  ) {
    return { category: "Tidak Dipotong", isDeducted: false, count: 0 };
  }

  // 3. Deteksi Cuti Khusus / Alasan Penting
  if (
    potongRaw === "khusus" || 
    potongRaw.includes("khusus") ||
    typeStr.startsWith("c+") || 
    typeStr.startsWith("c +") ||
    typeStr.includes("cuti khusus") ||
    typeStr.includes("alasan penting") ||
    typeStr.includes("pernikahan") ||
    typeStr.includes("melahirkan") ||
    typeStr.includes("keguguran") ||
    typeStr.includes("kematian") ||
    typeStr.includes("khitanan") ||
    typeStr.includes("baptis")
  ) {
    let count = parseFloat(r.count || r.jumlah_hari || (r.detail && r.detail.jumlah_hari)) || 1;
    if (typeStr.includes("1/2") || typeStr.includes("setengah hari")) count = 0.5;
    return { category: "Khusus", isDeducted: true, count };
  }

  // 4. Deteksi Cuti Akumulasi / Carryover / Cuti Sisa Tahun Lalu
  if (
    potongRaw === "akumulasi" || 
    potongRaw.includes("akumulasi") ||
    potongRaw === "sisa" ||
    potongRaw.includes("carry") ||
    typeStr.startsWith("cs -") || 
    typeStr.startsWith("cs-") ||
    typeStr.startsWith("cs ") ||
    typeStr === "cs" ||
    typeStr.includes("cuti sisa") ||
    typeStr.includes("akumulasi") ||
    typeStr.includes("carryover") ||
    typeStr.includes("carry over") ||
    typeStr.includes("tahun lalu")
  ) {
    let count = parseFloat(r.count || r.jumlah_hari || (r.detail && r.detail.jumlah_hari)) || 1;
    if (typeStr.includes("1/2") || typeStr.includes("setengah hari")) count = 0.5;
    return { category: "Akumulasi", isDeducted: true, count };
  }

  // 5. Standar Cuti Tahunan (Cuti Tahunan, Setengah Hari, Cuti Bersama, Sakit Tanpa Surat Dokter)
  let count = parseFloat(r.count || r.jumlah_hari || (r.detail && r.detail.jumlah_hari)) || 1;
  if (typeStr.includes("1/2") || typeStr.includes("setengah hari") || typeStr.startsWith("c1/2")) {
    count = 0.5;
  }
  return { category: "Tahunan", isDeducted: true, count };
}

export function getCalculatedJatahCuti(emp, cutiRecords = null) {
  if (!emp) return { jatahTahunan: 12, jatahKhusus: 4, jatahAkumulasi: 0, usedTahunan: 0, usedKhusus: 0, usedAkumulasi: 0, terpakaiTahunan: 0, terpakaiKhusus: 0, terpakaiAkumulasi: 0, sisaTahunan: 12, sisaKhusus: 4, sisaAkumulasi: 0 };

  const explicitTahunan = emp.jatah_cuti_tahunan ?? emp.jatah_tahunan;
  const explicitKhusus = emp.jatah_cuti_khusus ?? emp.jatah_khusus;
  const explicitAkumulasi = emp.jatah_cuti_akumulasi ?? emp.jatah_akumulasi;

  let jatahTahunan = (explicitTahunan !== undefined && explicitTahunan !== null && explicitTahunan !== "") 
    ? toNumber(explicitTahunan) 
    : null;
  let jatahKhusus = (explicitKhusus !== undefined && explicitKhusus !== null && explicitKhusus !== "") 
    ? toNumber(explicitKhusus) 
    : 4;
  let jatahAkumulasi = (explicitAkumulasi !== undefined && explicitAkumulasi !== null && explicitAkumulasi !== "") 
    ? toNumber(explicitAkumulasi) 
    : 0;

  let tenureYears = 0;
  let diffMonths = 0;

  if (emp.tanggal_join) {
    const join = smartParseDate(emp.tanggal_join);
    if (join) {
      const now = new Date();
      diffMonths = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
      tenureYears = diffMonths / 12;

      if (diffMonths >= 12) {
        let base = 12;
        // SK Bagian B: Cuti Penghargaan Masa Kerja
        // - Masa kerja 6 s/d < 8 tahun (72-95 bln): +1 hari (total 13)
        // - Masa kerja 8 s/d < 10 tahun (96-119 bln): +2 hari (total 14)
        // - Masa kerja 10 tahun ke atas (>= 120 bln / >= 10 thn): +4 hari (total 16)
        if (tenureYears >= 10 || diffMonths >= 120) base = 16;
        else if (tenureYears >= 8 || diffMonths >= 96) base = 14;
        else if (tenureYears >= 6 || diffMonths >= 72) base = 13;
        else base = 12;
        
        // Auto-heal if jatahTahunan was set to 0 or capped at 15 due to legacy calculation
        if (jatahTahunan === null || (jatahTahunan === 0 && tenureYears >= 1) || (base === 16 && (jatahTahunan === 15 || jatahTahunan === 12))) {
          jatahTahunan = base;
        }
      } else if (diffMonths >= 3) {
        // Masa kerja < 1 tahun (3-11 bulan): Cuti tahunan proporsional (1 hari/bulan)
        if (jatahTahunan === null || jatahTahunan === 0) {
          jatahTahunan = diffMonths;
        }
      } else {
        // Masa kerja < 3 bulan: belum berhak cuti tahunan
        if (jatahTahunan === null) {
          jatahTahunan = 0;
        }
      }
    }
  }

  if (jatahTahunan === null || jatahTahunan === undefined) {
    jatahTahunan = 12;
  }

  // LOGIKA CUTI AKUMULASI (CARRYOVER):
  // Dihitung dari sisa cuti tahun lalu dikalikan persentase masa kerja:
  // - 0 s/d di bawah 3 tahun: 0%
  // - 3 s/d di bawah 5 tahun: 50%
  // - 5 tahun ke atas: 100%
  if (emp.sisa_cuti_tahun_lalu !== undefined && emp.sisa_cuti_tahun_lalu !== null && emp.sisa_cuti_tahun_lalu !== "") {
    const sisaLalu = parseFloat(emp.sisa_cuti_tahun_lalu) || 0;
    if (tenureYears >= 5 || diffMonths >= 60) {
      jatahAkumulasi = Math.floor(sisaLalu * 1.0);
    } else if (tenureYears >= 3 || diffMonths >= 36) {
      jatahAkumulasi = Math.floor(sisaLalu * 0.5);
    } else {
      jatahAkumulasi = 0;
    }
  } else if (emp.tanggal_join && (tenureYears < 3 && diffMonths < 36)) {
    jatahAkumulasi = 0;
  }

  let usedTahunan = 0;
  let usedKhusus = 0;
  let usedAkumulasi = 0;

  if (Array.isArray(cutiRecords) && cutiRecords.length > 0) {
    const currentYear = new Date().getFullYear();
    cutiRecords.forEach(r => {
      const st = (r.status_final || r.status || "").toUpperCase();
      if (st.includes("REJECT") || st.includes("TOLAK")) return;

      const rowYear = parseInt(r.tahun) || (r.tanggal ? new Date(r.tanggal).getFullYear() : currentYear);
      if (rowYear !== currentYear) return;

      const deduction = getCutiDeductionCategory(r);
      if (!deduction.isDeducted || deduction.count <= 0) return;

      if (deduction.category === "Tahunan") {
        usedTahunan += deduction.count;
      } else if (deduction.category === "Khusus") {
        usedKhusus += deduction.count;
      } else if (deduction.category === "Akumulasi") {
        usedAkumulasi += deduction.count;
      }
    });
  }

  const sisaTahunan = Math.max(0, jatahTahunan - usedTahunan);
  const sisaKhusus = Math.max(0, jatahKhusus - usedKhusus);
  const sisaAkumulasi = Math.max(0, jatahAkumulasi - usedAkumulasi);

  return {
    jatahTahunan,
    jatahKhusus,
    jatahAkumulasi,
    usedTahunan,
    usedKhusus,
    usedAkumulasi,
    terpakaiTahunan: usedTahunan,
    terpakaiKhusus: usedKhusus,
    terpakaiAkumulasi: usedAkumulasi,
    sisaTahunan,
    sisaKhusus,
    sisaAkumulasi
  };
}

/* ---------------------------------------------------------------------
 * 9. WORKFLOW ENGINE — helper dinamis untuk field formulir (termasuk
 * tipe "file"/foto) dan Laporan Pertanggungjawaban (LPJ).
 * Dipakai bersama oleh pengajuan.js (form pengajuan) dan riwayat.js
 * (form isi LPJ) supaya render input & upload file konsisten di semua
 * modul yang memakai Form Builder — termasuk modul baru di masa depan.
 * ------------------------------------------------------------------- */

/** Render satu <input>/<select>/<textarea> untuk definisi field dinamis `f`. */
export function dynFieldInputHtml(f) {
 const base = "w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100 outline-none transition bg-white";
 const req = f.required ? "required" : "";
 if (f.formula) return `<input type="text" name="${f.name}" data-formula="${escapeHtml(f.formula)}" readonly class="${base} bg-slate-50 text-slate-500 cursor-not-allowed font-semibold" value="0">`;

 switch (f.type) {
 case "textarea": return `<textarea name="${f.name}" rows="3" class="${base}" placeholder="Tulis rincian..." ${req}></textarea>`;
 case "select": return `<select name="${f.name}" class="${base}" ${req}>
 <option value="">Pilih ${escapeHtml(f.label || "")}</option>
 ${(f.options || []).map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("")}
 </select>`;
 case "date": return `<input type="date" name="${f.name}" class="${base}" ${req}>`;
 case "time": return `<input type="time" name="${f.name}" class="${base}" ${req}>`;
 case "datetime-local": return `<input type="datetime-local" name="${f.name}" class="${base}" ${req}>`;
 case "scale": {
 const min = parseInt(f.min_scale) || 1;
 const max = parseInt(f.max_scale) || 5;
 const minLbl = f.min_label || "Sangat Kurang";
 const maxLbl = f.max_label || "Sangat Baik";
 const items = [];
 for (let val = min; val <= max; val++) {
 items.push(`
 <label class="flex-1 min-w-[36px] sm:min-w-[42px] text-center cursor-pointer">
 <input type="radio" name="${f.name}" value="${val}" ${req} class="peer sr-only">
 <div class="py-2 px-1 sm:px-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs peer-checked:bg-maroon-700 peer-checked:text-white peer-checked:border-maroon-700 hover:border-maroon-300 transition shadow-sm text-center">
 ${val}
 </div>
 </label>
 `);
 }
 return `
 <div class="space-y-2 p-3 bg-slate-50/70 border border-slate-200 rounded-xl">
 <div class="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1">
 ${items.join("")}
 </div>
 <div class="flex items-center justify-between text-[11px] font-semibold text-slate-500 px-1">
 <span class="text-slate-600">① ${escapeHtml(minLbl)}</span>
 <span class="text-slate-600">⑤ ${escapeHtml(maxLbl)}</span>
 </div>
 </div>
 `;
 }
 case "radio": {
 const opts = f.options && f.options.length ? f.options : ["Ya", "Tidak"];
 return `
 <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
 ${opts.map(o => `
 <label class="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer transition">
 <input type="radio" name="${f.name}" value="${escapeHtml(o)}" ${req} class="text-maroon-700 focus:ring-maroon-500">
 <span class="text-xs font-semibold text-slate-700">${escapeHtml(o)}</span>
 </label>
 `).join("")}
 </div>
 `;
 }
 case "checkbox": {
 const opts = f.options || [];
 if (opts.length > 0) {
 return `
 <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
 ${opts.map(o => `
 <label class="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer transition">
 <input type="checkbox" name="${f.name}" value="${escapeHtml(o)}" class="rounded border-slate-300 text-maroon-700 focus:ring-maroon-500">
 <span class="text-xs font-semibold text-slate-700">${escapeHtml(o)}</span>
 </label>
 `).join("")}
 </div>
 `;
 }
 return `
 <label class="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer transition">
 <input type="checkbox" name="${f.name}" value="Ya" ${req} class="rounded border-slate-300 text-maroon-700 focus:ring-maroon-500">
 <span class="text-xs font-semibold text-slate-700">${escapeHtml(f.label || "Ya / Setuju")}</span>
 </label>
 `;
 }
 case "number": return `<input type="number" step="any" name="${f.name}" class="${base}" placeholder="0" ${req}>`;
 case "file": return `<input type="file" name="${f.name}" accept="image/*,.pdf" class="${base} bg-white" ${req}>
 <p class="text-[11px] text-slate-400 mt-1">Upload foto/dokumen (JPG, PNG, atau PDF, maks 5MB).</p>`;
 default: return `<input type="text" name="${f.name}" class="${base}" placeholder="Isi ${escapeHtml(f.label || "")}" ${req}>`;
 }
}

/** Wrapper lengkap (label + input + hint show_if) untuk satu field dinamis. */
export function dynFieldWrapperHtml(f) {
 const req = f.required ? ' <span class="text-red-500">*</span>' : "";
 return `
 <div data-field-wrap="${f.name}" class="${f.show_if ? "hidden" : ""}">
 <label class="block text-xs font-medium text-slate-500 mb-1.5">${escapeHtml(f.label || f.name)}${req}</label>
 ${dynFieldInputHtml(f)}
 ${f.formula ? `<p class="text-[11px] text-slate-400 mt-1">Dihitung otomatis: ${escapeHtml(f.formula)}</p>` : ""}
 </div>`;
}

/** Pasang listener show_if (tampil-kondisional) + formula (kalkulasi otomatis) pada sebuah <form>. */
export function wireDynFormLogic(form, fields) {
 const recompute = () => {
 const fd = new FormData(form);
 const values = {};
 fields.forEach(f => values[f.name] = fd.get(f.name));

 fields.forEach(f => {
 if (!f.show_if) return;
 const wrap = form.querySelector(`[data-field-wrap="${f.name}"]`);
 if (!wrap) return;
 const show = String(values[f.show_if.field] || "") === String(f.show_if.value);
 wrap.classList.toggle("hidden", !show);
 // Field yang sedang disembunyikan tidak boleh memblokir submit via `required`
 const input = wrap.querySelector(`[name="${f.name}"]`);
 if (input) input.dataset.origRequired = input.dataset.origRequired ?? (input.required ? "1" : "0");
 if (input) input.required = show && input.dataset.origRequired === "1";
 });

 fields.forEach(f => {
 if (!f.formula) return;
 const input = form.querySelector(`[name="${f.name}"]`);
 const result = evalFormula(f.formula, values);
 if (input) input.value = result === null ? "0" : result.toLocaleString("id-ID", { maximumFractionDigits: 2 });
 });
 };
 form.addEventListener("input", recompute);
 recompute();
}

/**
 * Kumpulkan nilai form (termasuk upload file ke Google Drive) menjadi
 * satu object `detail`. File diupload ke subfolder Drive `pathPrefix`
 * (mis. "Pengajuan/TRX-123" atau "LPJ/TRX-123") lewat Apps Script Web
 * App (lihat js/gas-integration.js), dan hasilnya berupa URL Drive.
 * PERUBAHAN: sebelumnya file diupload ke Firebase Storage.
 * @param {HTMLFormElement} form
 * @param {Array} fields definisi field (name, type, required, label)
 * @param {string} pathPrefix mis. "Pengajuan/TRX-123" atau "LPJ/TRX-123"
 */
export async function collectDynFormDetail(form, fields, pathPrefix) {
 const fd = new FormData(form);
 const detail = {};
 for (const f of fields) {
 if (f.type === "file") {
 const fileInput = form.querySelector(`[name="${f.name}"]`);
 const file = fileInput && fileInput.files && fileInput.files[0];
 if (file) {
 if (file.size > 5 * 1024 * 1024) throw new Error(`File untuk "${f.label || f.name}" melebihi 5MB.`);
 detail[f.name] = await uploadFileToDrive(file, pathPrefix);
 } else {
 detail[f.name] = "";
 }
 } else if (f.type === "checkbox") {
 const vals = fd.getAll(f.name).filter(Boolean);
 detail[f.name] = vals.length > 1 ? vals.join(", ") : (vals[0] ?? "");
 } else {
 detail[f.name] = fd.get(f.name) ?? "";
 }
 }
 return detail;
}

/**
 * Format sebuah tanggal (Date, Firestore Timestamp, atau string) ke
 * "YYYY-MM-DD" SELALU dalam zona waktu Asia/Jakarta (WIB) -- BUKAN zona
 * waktu sistem perangkat yang menjalankan kode ini. Kalau dipanggil
 * tanpa argumen, defaultnya "hari ini" (WIB).
 *
 * PENTING (bug yang diperbaiki): sebelumnya beberapa tempat memakai
 * `new Date().toISOString().substring(0,10)` (zona UTC) atau
 * `.getDate()/.getMonth()` (zona waktu SISTEM PERANGKAT). Keduanya bisa
 * meleset dari WIB tergantung jam & timezone perangkat yang dipakai
 * membuka aplikasi. Dipakai untuk SEMUA perbandingan "hari ini" (Cuti
 * Hari Ini, personalisasi ulang tahun/anniversary/cuti di dashboard).
 */
export function localDateStr(value) {
 const v = value === undefined ? new Date() : value;
 if (v === null || v === "") return null;
 const d = v && typeof v.toDate === "function" ? v.toDate() : new Date(v);
 if (isNaN(d)) return null;
 return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Format nomor telepon ke format internasional WhatsApp (628xxx)
 */
export function formatPhoneNumberForWa(phone) {
 if (!phone) return "";
 let clean = String(phone).replace(/[^0-9]/g, "");
 if (!clean) return "";
 if (clean.startsWith("0")) {
 clean = "62" + clean.substring(1);
 } else if (clean.startsWith("8")) {
 clean = "62" + clean;
 } else if (!clean.startsWith("62")) {
 clean = "62" + clean;
 }
 return clean;
}

/**
 * Membuka link WhatsApp (wa.me atau api.whatsapp.com) dengan pesan yang di-encode
 */
export function openWhatsAppMessage(phone, message) {
 const cleanPhone = formatPhoneNumberForWa(phone);
 const encodedMsg = encodeURIComponent(message);
 let url = "";
 if (cleanPhone) {
 url = `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
 } else {
 url = `https://api.whatsapp.com/send?text=${encodedMsg}`;
 }
 window.open(url, "_blank");
}

/**
 * Mencari nomor HP/WA karyawan dari MASTER_KARYAWAN berdasarkan nama karyawan
 * dan mengembalikan dalam format kode negara Indonesia (62xxx).
 */
export async function getEmployeePhoneByName(namaKaryawan) {
 if (!namaKaryawan) return "";
 try {
 const list = await fsGetAll(COL.MASTER_KARYAWAN);
 const targetName = String(namaKaryawan).toLowerCase().trim();
 const found = list.find(k => {
 const n = String(k.nama_karyawan || k.nama || k.nama_lengkap || "").toLowerCase().trim();
 return n === targetName || (n && targetName && (n.includes(targetName) || targetName.includes(n)));
 });
 const rawPhone = found ? (found.no_hp_aktif || found.no_telepon || found.no_hp || found.hp || found.whatsapp || "") : "";
 return formatPhoneNumberForWa(rawPhone);
 } catch (err) {
 console.warn("Gagal mengambil no_hp karyawan:", err);
 return "";
 }
}

/**
 * Menyusun template pesan WhatsApp untuk Tugas / Hasil Penilaian KPI 360
 */
export function buildKpiTaskWaMessage(task, type = "ASSIGNMENT", extra = {}) {
 const baseUrl = window.location.origin + window.location.pathname;
 const deadlineStr = task.deadline ? fmtDateShort(task.deadline) : "-";
 const catLabel = task.kategori_penilaian ? task.kategori_penilaian.replace(/_/g, " ") : "KPI 360";

 if (type === "ASSIGNMENT") {
 const magicLink = extra.magicLink || `${baseUrl}#penilaian-kontrak?tab=kpi360`;
 let msg = `*TUGAS PENILAIAN KPI 360 - CV ANDELA JAYA*\n\n`;
 msg += `Halo *${task.nama_penilai || "Bapak/Ibu"}*,\n`;
 msg += `Anda telah ditugaskan untuk melakukan Penilaian KPI 360 pada periode *${task.periode || "-"}* terhadap karyawan berikut:\n`;
 msg += `*${task.nama_dinilai || "-"}*\n\n`;
 msg += `*Detail Penugasan:*\n`;
 msg += `• Periode: ${task.periode || "-"}\n`;
 msg += `• Kategori: ${catLabel}\n`;
 msg += `• Batas Waktu: ${deadlineStr}\n\n`;
 msg += `Silakan klik link berikut untuk login & mengisi penilaian:\n`;
 msg += `${magicLink}\n\n`;
 if (extra.penilaiUsername) {
 msg += `_Kredensial Akses_:\n`;
 msg += `• Username: \`${extra.penilaiUsername}\`\n\n`;
 }
 msg += `Terima kasih,\n*Tim HRD CV Andela Jaya*`;
 return msg;
 } else if (type === "RESULT") {
 const portalLink = `${baseUrl}#penilaian-kontrak?tab=grafik`;
 let msg = `*HASIL PENILAIAN KPI - CV ANDELA JAYA*\n\n`;
 msg += `Halo *${task.nama_dinilai || "Karyawan"}*,\n`;
 msg += `Hasil Penilaian Kinerja (KPI 360) Anda untuk periode *${task.periode || "-"}* telah selesai dievaluasi.\n\n`;
 msg += `*Ringkasan Hasil Penilaian:*\n`;
 msg += `• Kategori: ${catLabel}\n`;
 msg += `• Skor Akhir: *${task.skor_akhir ?? task.total_skor ?? 0}*\n`;
 if (task.rekomendasi || task.keputusan) {
 msg += `• Rekomendasi/Keputusan: *${task.rekomendasi || task.keputusan}*\n`;
 }
 msg += `• Penilai: ${task.nama_penilai || "-"}\n\n`;
 if (task.catatan_baik) {
 msg += `*Hal yang Sudah Baik:*\n${task.catatan_baik}\n\n`;
 }
 if (task.catatan_perbaikan) {
 msg += `*Area Peningkatan:*\n${task.catatan_perbaikan}\n\n`;
 }
 msg += `Rincian lengkap & grafik evaluasi dapat Anda akses di Portal HRIS:\n`;
 msg += `${portalLink}\n\n`;
 msg += `Terima kasih dan tetap tingkatkan kinerja terbaik Anda!\n`;
 msg += `*Tim HRD CV Andela Jaya*`;
 return msg;
 }
 return "";
}


/**
 * Menyusun template pesan undangan login untuk Karyawan
 */
export function buildEmployeeInviteMessage(empData, username, password, portalUrl) {
  const nama = empData?.nama_karyawan || empData?.nama || "Karyawan";
  const url = portalUrl || (window.location.origin + window.location.pathname);
  
  let msg = `*UNDANGAN AKSES SISTEM HRIS - ${COMPANY_NAME}*

`;
  msg += `Halo *${nama}*,

`;
  msg += `Anda diundang untuk mengakses Portal Sistem Informasi SDM & HRIS *${COMPANY_NAME}*.

`;
  msg += `Berikut kredensial login akun Anda:
`;
  msg += `*Link Portal*: ${url}
`;
  msg += `*Username*: \`${username}\`
`;
  msg += `*Password Default*: \`${password}\`

`;
  msg += `*Petunjuk Login*:
`;
  msg += `1. Buka link portal di atas.
`;
  msg += `2. Masukkan Username dan Password Default di atas.
`;
  msg += `3. Setelah berhasil masuk, Anda dapat mengubah password demi keamanan melalui menu Pengaturan Akun.

`;
  msg += `Apabila membutuhkan bantuan atau kendala login, silakan hubungi Tim HRD.

`;
  msg += `Terima kasih,
`;
  msg += `_*Tim HRD ${COMPANY_NAME}*_`;
  return msg;
}

/**
 * Membuka Modal "Undang Karyawan" untuk mengirim kredensial login (Username & Default Password)
 * via WhatsApp dan/atau Email.
 */
export async function openInviteEmployeeModal(defaultEmpNikOrName = "") {
  try {
    toast("Memuat data karyawan & akun pengguna...", "info");
    const [allKaryawan, allUsers] = await Promise.all([
      fsGetAll(COL.MASTER_KARYAWAN).catch(() => []),
      fsGetAll(COL.USERS).catch(() => [])
    ]);

    const activeEmp = allKaryawan.filter(k => {
      const st = String(k.aktif_tdk_aktif || k.status || "AKTIF").toUpperCase();
      return st === "AKTIF";
    }).sort((a, b) => (a.nama_karyawan || a.nama || "").localeCompare(b.nama_karyawan || b.nama || ""));

    if (!activeEmp.length) {
      toast("Tidak ada karyawan aktif ditemukan di Master Karyawan.", "warning");
      return;
    }

    const defaultPasswordVal = "andela123";
    const baseUrl = window.location.origin + window.location.pathname;

    openModal({
      title: " Undangan Akses Sistem HRIS Karyawan",
      size: "lg",
      bodyHtml: `
        <div class="space-y-4 text-left">
          <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5">
            <div>
              <h4 class="text-xs font-bold text-emerald-900">Kirim Kredensial Login Karyawan</h4>
              <p class="text-[11px] text-emerald-700">Undang karyawan baru atau reset kredensial untuk memberikan akses ke portal HRIS. Undangan dilengkapi Username, Password Default, dan link portal (otomatis diawali kode negara 62 untuk WhatsApp).</p>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Pilih Karyawan Ybs *</label>
            <select id="inv-emp-select" class="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl outline-none focus:border-emerald-500 bg-white">
              <option value="">-- Pilih Karyawan Aktif --</option>
              ${activeEmp.map((k, idx) => {
                const nik = k.nik_karyawan || k.nik || "-";
                const nama = k.nama_karyawan || k.nama || "Karyawan";
                const dept = k.departemen || k.jabatan || k.cabang || "-";
                return `<option value="${idx}" data-nik="${escapeHtml(nik)}" data-nama="${escapeHtml(nama)}">${escapeHtml(nama)} (${escapeHtml(nik)}) - ${escapeHtml(dept)}</option>`;
              }).join("")}
            </select>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div>
              <label class="block text-[11px] font-bold text-slate-600 mb-1">Nama Lengkap *</label>
              <input type="text" id="inv-nama" class="w-full px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg outline-none focus:border-emerald-500" placeholder="Pilih karyawan atau ketik nama...">
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-600 mb-1">Username Login *</label>
              <input type="text" id="inv-username" class="w-full px-3 py-1.5 text-xs font-mono font-bold uppercase bg-white border border-slate-200 rounded-lg outline-none focus:border-emerald-500" placeholder="Contoh: AHMAD123">
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-600 mb-1">Password Default *</label>
              <input type="text" id="inv-password" value="${defaultPasswordVal}" class="w-full px-3 py-1.5 text-xs font-mono font-bold bg-white border border-slate-200 rounded-lg outline-none focus:border-emerald-500">
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-600 mb-1">Role / Hak Akses *</label>
              <select id="inv-role" class="w-full px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg outline-none focus:border-emerald-500">
                <option value="STAFF">STAFF</option>
                <option value="SPV">SPV / ATASAN</option>
                <option value="MANAGER">MANAGER</option>
                <option value="DRIVER">DRIVER</option>
                <option value="HELPER">HELPER</option>
                <option value="SALES">SALES</option>
                <option value="WAREHOUSE">WAREHOUSE</option>
                <option value="FINANCE">FINANCE</option>
                <option value="HRD">HRD</option>
              </select>
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-600 mb-1">Nomor WhatsApp (62...)</label>
              <input type="text" id="inv-phone" class="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg outline-none focus:border-emerald-500" placeholder="08123456789">
              <p class="text-[10px] text-slate-400 mt-0.5">*Otomatis diawali kode negara +62 Indonesia</p>
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-600 mb-1">Alamat Email Karyawan</label>
              <input type="email" id="inv-email" class="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg outline-none focus:border-emerald-500" placeholder="nama@email.com">
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">Pratinjau Pesan Undangan (WhatsApp & Email)</label>
            <textarea id="inv-preview-msg" rows="7" class="w-full px-3 py-2 text-xs font-mono bg-slate-900 text-emerald-300 rounded-xl outline-none border border-slate-700 focus:border-emerald-500 leading-relaxed"></textarea>
          </div>
        </div>
      `,
      footerHtml: `
        <div class="flex items-center justify-between w-full flex-wrap gap-2">
          <button id="btn-inv-close" class="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition">Tutup</button>
          <div class="flex items-center gap-2">
            <button id="btn-inv-email" class="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-md flex items-center gap-1.5">
              Kirim Email
            </button>
            <button id="btn-inv-wa" class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-md flex items-center gap-1.5">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
              Kirim WhatsApp
            </button>
            <button id="btn-inv-both" class="px-5 py-2.5 bg-maroon-700 hover:bg-maroon-800 text-white rounded-lg text-xs font-bold transition shadow-md flex items-center gap-1.5">
              Kirim WA & Email
            </button>
          </div>
        </div>
      `,
      onMount: (modalEl) => {
        const selectEmp = modalEl.querySelector("#inv-emp-select");
        const inputNama = modalEl.querySelector("#inv-nama");
        const inputUser = modalEl.querySelector("#inv-username");
        const inputPass = modalEl.querySelector("#inv-password");
        const inputRole = modalEl.querySelector("#inv-role");
        const inputPhone = modalEl.querySelector("#inv-phone");
        const inputEmail = modalEl.querySelector("#inv-email");
        const previewMsg = modalEl.querySelector("#inv-preview-msg");

        function updatePreview() {
          const empName = inputNama.value.trim() || "Karyawan";
          const uName = inputUser.value.trim().toUpperCase() || "[USERNAME]";
          const pWord = inputPass.value || "[PASSWORD]";
          
          previewMsg.value = buildEmployeeInviteMessage({ nama_karyawan: empName }, uName, pWord, baseUrl);
        }

        selectEmp.onchange = () => {
          const idxVal = selectEmp.value;
          if (idxVal === "" || idxVal === undefined) {
            inputNama.value = "";
            inputUser.value = "";
            inputPhone.value = "";
            inputEmail.value = "";
            updatePreview();
            return;
          }

          const k = activeEmp[Number(idxVal)];
          const selectedOpt = selectEmp.options[selectEmp.selectedIndex];
          const namaOpt = selectedOpt?.dataset?.nama || (selectedOpt?.textContent || "").split("(")[0].trim();
          const nikOpt = selectedOpt?.dataset?.nik || k?.nik_karyawan || k?.nik || "";

          const matchedUser = allUsers.find(u => 
            (u.nik && String(u.nik) !== "-" && nikOpt && String(u.nik) === String(nikOpt)) ||
            (u.nama && String(u.nama).toLowerCase().trim() === String(namaOpt).toLowerCase().trim()) ||
            (u.username && k?.username && String(u.username).toLowerCase() === String(k.username).toLowerCase())
          );

          inputNama.value = k?.nama_karyawan || k?.nama || matchedUser?.nama || namaOpt || "";
          
          let calculatedUsername = matchedUser?.username || k?.username || (nikOpt && nikOpt !== "-" ? nikOpt : "");
          if (!calculatedUsername) {
            const firstName = String(inputNama.value || "USER").trim().split(" ")[0].replace(/[^a-zA-Z0-9]/g, "");
            calculatedUsername = firstName.toUpperCase() || "USER";
          }
          inputUser.value = String(calculatedUsername).toUpperCase();

          if (matchedUser?.role) {
            inputRole.value = matchedUser.role.toUpperCase();
          } else if (k?.jabatan || k?.posisi) {
            const jUpper = (k.jabatan || k.posisi || "").toUpperCase();
            if (jUpper.includes("MANAGER")) inputRole.value = "MANAGER";
            else if (jUpper.includes("SUPERVISOR") || jUpper.includes("SPV")) inputRole.value = "SPV";
            else if (jUpper.includes("DRIVER")) inputRole.value = "DRIVER";
            else if (jUpper.includes("SALES")) inputRole.value = "SALES";
            else if (jUpper.includes("WAREHOUSE") || jUpper.includes("GUDANG")) inputRole.value = "WAREHOUSE";
            else inputRole.value = "STAFF";
          }

          const rawPhone = k?.no_hp_aktif || k?.no_telepon || k?.no_hp || k?.hp || k?.whatsapp || matchedUser?.no_hp || matchedUser?.no_telepon || "";
          inputPhone.value = formatPhoneNumberForWa(rawPhone);

          inputEmail.value = k?.email || k?.email_perusahaan || matchedUser?.email || "";

          updatePreview();
        };

        inputNama.oninput = updatePreview;
        inputUser.oninput = updatePreview;
        inputPass.oninput = updatePreview;

        if (defaultEmpNikOrName) {
          const matchOpt = Array.from(selectEmp.options).find(opt => 
            opt.dataset.nik === defaultEmpNikOrName || 
            opt.dataset.nama?.toLowerCase().includes(defaultEmpNikOrName.toLowerCase()) ||
            opt.textContent.toLowerCase().includes(defaultEmpNikOrName.toLowerCase())
          );
          if (matchOpt) {
            selectEmp.value = matchOpt.value;
            selectEmp.dispatchEvent(new Event("change"));
          }
        }

        async function ensureUserAccount() {
          const uname = inputUser.value.trim().toUpperCase();
          const pword = inputPass.value;
          const nama = inputNama.value.trim();
          const role = inputRole.value;
          const email = inputEmail.value.trim();
          const phone = inputPhone.value.trim();
          const selectedOpt = selectEmp.options[selectEmp.selectedIndex];
          const nik = selectedOpt?.dataset?.nik || "-";

          if (!uname || !pword || !nama) {
            toast("Nama, Username, dan Password wajib diisi!", "warning");
            return false;
          }

          try {
            const pHash = await sha256(pword);
            await setDoc(doc(db, COL.USERS, uname), {
              username: uname,
              nama: nama,
              nik: nik || "-",
              role: role,
              email: email || "",
              no_hp: phone || "",
              password_hash: pHash,
              password: pword,
              updated_at: new Date().toISOString()
            }, { merge: true });
            
            toast(`Akun pengguna ${uname} berhasil diperbarui di database!`, "success");
            return true;
          } catch (err) {
            console.error("Gagal update akun USERS:", err);
            toast("Gagal menyimpan akun: " + err.message, "error");
            return false;
          }
        }

        modalEl.querySelector("#btn-inv-close").onclick = closeModal;

        modalEl.querySelector("#btn-inv-wa").onclick = async () => {
          const phone = formatPhoneNumberForWa(inputPhone.value.trim());
          if (!phone) {
            toast("Mohon isi nomor WhatsApp karyawan tujuan!", "warning");
            return;
          }
          const saved = await ensureUserAccount();
          if (!saved) return;

          openWhatsAppMessage(phone, previewMsg.value);
          closeModal();
        };

        modalEl.querySelector("#btn-inv-email").onclick = async () => {
          const email = inputEmail.value.trim();
          if (!email) {
            toast("Mohon isi alamat email karyawan tujuan!", "warning");
            return;
          }
          const saved = await ensureUserAccount();
          if (!saved) return;

          toast(`Mengirim email undangan ke ${email}...`, "info");
          
          const htmlEmail = buildStandardEmailHtml({
            badgeText: "Akses Akun",
            badgeVariant: "maroon",
            title: "Undangan Akses Portal HRIS & Kepegawaian",
            recipientName: inputNama.value,
            introText: `Anda telah diundang untuk mengakses Portal Sistem Informasi SDM (HRIS) <strong>${escapeHtml(COMPANY_NAME)}</strong>. Berikut adalah informasi kredensial akun login Anda:`,
            infoList: [
              { label: "URL Portal HRIS", value: `<a href="${baseUrl}" style="color: #7a1f2b; font-weight: bold; text-decoration: underline;">${escapeHtml(baseUrl)}</a>`, isHtml: true },
              { label: "Username", value: inputUser.value.toUpperCase() },
              { label: "Password Default", value: inputPass.value },
              { label: "Role Akses", value: inputRole.value }
            ],
            bodyHtml: `
              <div style="margin-top: 18px; padding: 12px 16px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px;">
                <strong style="color: #0f172a;">Langkah Login Pertama:</strong>
                <ol style="padding-left: 20px; margin: 8px 0 0 0; color: #475569; line-height: 1.6;">
                  <li>Klik tombol atau tautan portal HRIS di bawah.</li>
                  <li>Masukkan <strong>Username</strong> dan <strong>Password Default</strong> di atas.</li>
                  <li>Disarankan untuk segera memperbarui password Anda melalui menu Profil setelah berhasil login.</li>
                </ol>
              </div>
            `,
            actionUrl: baseUrl,
            actionText: "Login ke Portal HRIS →",
            secondaryNote: "Jika ada pertanyaan atau kendala akses, silakan hubungi tim HRD CV Andela Jaya."
          });

          const sent = await sendEmailNotif(email, `[Undangan HRIS] Kredensial Login - ${COMPANY_NAME}`, htmlEmail);
          if (sent) {
            toast(`Email undangan berhasil dikirim ke ${email}!`, "success");
            closeModal();
          } else {
            toast("Gagal mengirim email undangan. Silakan periksa jaringan / gunakan WhatsApp.", "error");
          }
        };

        modalEl.querySelector("#btn-inv-both").onclick = async () => {
          const phone = formatPhoneNumberForWa(inputPhone.value.trim());
          const email = inputEmail.value.trim();

          if (!phone && !email) {
            toast("Mohon isi nomor WA atau email karyawan tujuan!", "warning");
            return;
          }

          const saved = await ensureUserAccount();
          if (!saved) return;

          if (email) {
            toast(`Mengirim email undangan ke ${email}...`, "info");
            const htmlEmail = buildStandardEmailHtml({
              badgeText: "Akses Akun",
              badgeVariant: "maroon",
              title: "Undangan Akses Portal HRIS & Kepegawaian",
              recipientName: inputNama.value,
              introText: `Anda telah diundang untuk mengakses Portal Sistem Informasi SDM (HRIS) <strong>${escapeHtml(COMPANY_NAME)}</strong>. Berikut adalah informasi kredensial akun login Anda:`,
              infoList: [
                { label: "URL Portal HRIS", value: `<a href="${baseUrl}" style="color: #7a1f2b; font-weight: bold; text-decoration: underline;">${escapeHtml(baseUrl)}</a>`, isHtml: true },
                { label: "Username", value: inputUser.value.toUpperCase() },
                { label: "Password Default", value: inputPass.value },
                { label: "Role Akses", value: inputRole.value }
              ],
              bodyHtml: `
                <div style="margin-top: 18px; padding: 12px 16px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px;">
                  <strong style="color: #0f172a;">Langkah Login Pertama:</strong>
                  <ol style="padding-left: 20px; margin: 8px 0 0 0; color: #475569; line-height: 1.6;">
                    <li>Klik tombol atau tautan portal HRIS di bawah.</li>
                    <li>Masukkan <strong>Username</strong> dan <strong>Password Default</strong> di atas.</li>
                    <li>Disarankan untuk segera memperbarui password Anda melalui menu Profil setelah berhasil login.</li>
                  </ol>
                </div>
              `,
              actionUrl: baseUrl,
              actionText: "Login ke Portal HRIS →",
              secondaryNote: "Jika ada pertanyaan atau kendala akses, silakan hubungi tim HRD CV Andela Jaya."
            });
            await sendEmailNotif(email, `[Undangan HRIS] Kredensial Login - ${COMPANY_NAME}`, htmlEmail);
          }

          if (phone) {
            openWhatsAppMessage(phone, previewMsg.value);
          } else {
            toast("Email berhasil dikirim!", "success");
          }

          closeModal();
        };
      }
    });

  } catch (err) {
    console.error("Gagal membuka modal undang karyawan:", err);
    toast("Terjadi kesalahan: " + err.message, "error");
  }
}

/* ---------------------------------------------------------------------
 * GEOCODING & ROUTE DISTANCE UTILITIES (SUMMARY & TRACKING SALES)
 * ------------------------------------------------------------------- */

/**
 * Calculates straight-line distance in kilometers between two GPS coordinates using Haversine formula
 */
export function calcHaversineDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null || isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) {
    return 0;
  }
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const dist = R * c;
  return Math.round(dist * 10) / 10;
}

/**
 * Parses GPS string formatted like "-6.7321, 108.5523", "-6.7321 108.5523", or "lat: -6.7321 long: 108.5523"
 */
export function parseGpsCoordinates(gpsStr) {
  if (gpsStr === null || gpsStr === undefined) return null;
  if (typeof gpsStr !== "string") gpsStr = String(gpsStr);
  const trimmed = gpsStr.trim();
  if (!trimmed) return null;

  // Replace Indonesian comma decimal notation if surrounded by digits (e.g. -6,732042 -> -6.732042)
  const normalized = trimmed.replace(/(\d+),(\d+)/g, "$1.$2");

  // 1. Standard pattern: two floating point numbers separated by comma, semicolon, or whitespace
  const match = normalized.match(/(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)/);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }

  // 2. Generic numeric pair (floats or ints)
  const altMatch = normalized.match(/(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/);
  if (altMatch) {
    const lat = parseFloat(altMatch[1]);
    const lng = parseFloat(altMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)) {
      return { lat, lng };
    }
  }

  return null;
}

/**
 * Validates if coordinates are within Java island coverage area
 * Lat: -8.0 to -5.8, Lng: 106.5 to 110.8
 */
export function isValidOperationalCoordinate(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) return false;
  // Valid coordinate boundary for Indonesia (covers West Java Cirebon, East Java Malang & Batu, and entire Indonesia)
  return lat >= -11.5 && lat <= 6.5 && lng >= 95.0 && lng <= 141.5;
}

/**
 * Helper to query Photon Komoot OSM Geocoding Service (with dynamic bias for Malang/Batu & Cirebon)
 */
async function fetchPhotonQuery(queryString) {
  try {
    const query = encodeURIComponent(queryString);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const qLower = queryString.toLowerCase();
    
    // Determine coordinate bias: Malang/Batu vs Cirebon/Tegal
    let latBias = -6.86;
    let lonBias = 108.8;
    let bbox = "105.0,-9.0,115.5,-5.5"; // Covering West, Central, and East Java
    
    if (qLower.includes("malang") || qLower.includes("batu") || qLower.includes("singosari") || qLower.includes("lawang") || qLower.includes("kepanjen") || qLower.includes("pujon") || qLower.includes("jatim") || qLower.includes("jawa timur")) {
      latBias = -7.98;
      lonBias = 112.63;
      bbox = "111.0,-8.6,113.8,-7.4";
    } else if (qLower.includes("cirebon") || qLower.includes("kuningan") || qLower.includes("majalengka") || qLower.includes("indramayu") || qLower.includes("brebes") || qLower.includes("tegal")) {
      latBias = -6.86;
      lonBias = 108.8;
      bbox = "107.0,-7.8,110.5,-6.0";
    }

    const url = `https://photon.komoot.io/api/?q=${query}&limit=1&lat=${latBias}&lon=${lonBias}&bbox=${bbox}`;
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.features && data.features.length > 0) {
        const feat = data.features[0];
        const coords = feat.geometry?.coordinates;
        if (coords && coords.length >= 2) {
          const lng = parseFloat(coords[0]);
          const lat = parseFloat(coords[1]);
          if (isValidOperationalCoordinate(lat, lng)) {
            return {
              lat,
              lng,
              formatted: feat.properties?.name ? `${feat.properties.name}, ${feat.properties.city || feat.properties.state || ''}` : queryString,
              source: "PHOTON_OSM"
            };
          }
        }
      }
    }
  } catch (e) {
    // Ignore fetch error
  }
  return null;
}

/**
 * Helper to query OpenStreetMap Nominatim Geocoding Service (covering Malang/Batu & Cirebon)
 */
async function fetchNominatimQuery(queryString) {
  try {
    const query = encodeURIComponent(queryString);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const qLower = queryString.toLowerCase();
    
    let viewboxParam = "&viewbox=105.0,-5.5,115.5,-9.0";
    if (qLower.includes("malang") || qLower.includes("batu") || qLower.includes("singosari") || qLower.includes("kepanjen") || qLower.includes("pujon")) {
      viewboxParam = "&viewbox=111.0,-7.4,113.8,-8.6";
    } else if (qLower.includes("cirebon") || qLower.includes("kuningan") || qLower.includes("tegal") || qLower.includes("brebes")) {
      viewboxParam = "&viewbox=107.0,-6.0,110.5,-7.8";
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1&addressdetails=1&countrycodes=id${viewboxParam}`;
    const resp = await fetch(url, {
      headers: {
        'Accept-Language': 'id,en',
        'User-Agent': 'AndelaHRIS-SalesApp/1.0 (contact@andelahris.com)'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.length > 0 && data[0].lat && data[0].lon) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        if (isValidOperationalCoordinate(lat, lng)) {
          return {
            lat,
            lng,
            formatted: data[0].display_name || queryString,
            source: "NOMINATIM_OSM"
          };
        }
      }
    }
  } catch (e) {
    // Abort or network error
  }
  return null;
}

/**
 * Generates search query variations from raw address string
 */
function generateAddressCandidates(rawAddr) {
  if (!rawAddr || typeof rawAddr !== "string") return [];
  const clean = rawAddr.trim();
  if (!clean) return [];

  const candidates = [];

  // Strip Plus Code if present (e.g. "6W6C+7GP, Sei Pinang..." -> "Sei Pinang...")
  const withoutPlusCode = clean.replace(/\b[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/ig, "").replace(/^[,\s]+|[,\s]+$/g, "").trim();
  if (withoutPlusCode && withoutPlusCode !== clean) {
    candidates.push(withoutPlusCode.includes("Indonesia") ? withoutPlusCode : `${withoutPlusCode}, Indonesia`);
    const subParts = withoutPlusCode.split(",").map(p => p.trim()).filter(Boolean);
    if (subParts.length > 1) {
      const subEnd = subParts.slice(-2).join(", ");
      candidates.push(subEnd.includes("Indonesia") ? subEnd : `${subEnd}, Indonesia`);
    }
  }

  // 1. Full address string with Jawa Tengah / Jawa Barat, Indonesia
  candidates.push(clean.includes("Indonesia") ? clean : `${clean}, Indonesia`);

  // 2. Strip store / business name prefixes
  const strippedPrefix = clean.replace(/^(toko|tb|ud|cv|pt|outlet|warung|kios|depot|apotek|swalayan|minimarket|resto|rm|rumah makan|bengkel|grosir|toko manisan|agen|distributor|koperasi)\s+/i, "");
  if (strippedPrefix !== clean) {
    candidates.push(strippedPrefix.includes("Indonesia") ? strippedPrefix : `${strippedPrefix}, Indonesia`);
  }

  // 3. Split by comma (remove store name or leading segment)
  const parts = clean.split(",").map(p => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    const withoutStore = parts.slice(1).join(", ");
    candidates.push(withoutStore.includes("Indonesia") ? withoutStore : `${withoutStore}, Indonesia`);

    const withoutNo = withoutStore.replace(/no\.?\s*\d+/gi, "").replace(/\s+/g, " ").trim();
    if (withoutNo !== withoutStore && withoutNo.length > 3) {
      candidates.push(withoutNo.includes("Indonesia") ? withoutNo : `${withoutNo}, Indonesia`);
    }

    if (parts.length >= 3) {
      const cityRegion = parts.slice(-2).join(", ");
      candidates.push(cityRegion.includes("Indonesia") ? cityRegion : `${cityRegion}, Indonesia`);
    }
  }

  // 4. Street pattern match ("Jl", "Jalan", "Gg", "Gang")
  const streetMatch = clean.match(/(jl\b|jalan\b|jln\b|gg\b|gang\b).*/i);
  if (streetMatch && streetMatch[0]) {
    const streetAddr = streetMatch[0].trim();
    candidates.push(streetAddr.includes("Indonesia") ? streetAddr : `${streetAddr}, Indonesia`);
  }

  // Deduplicate candidates
  return [...new Set(candidates)];
}

/**
 * Multi-pass OpenStreetMap geocoder using Nominatim and Photon APIs
 */
async function geocodeWithOSM(rawAddr) {
  const candidates = generateAddressCandidates(rawAddr);
  if (candidates.length === 0) return null;

  // Pass 1: Try Nominatim on top candidates
  for (const candidate of candidates.slice(0, 3)) {
    const res = await fetchNominatimQuery(candidate);
    if (res) return res;
  }

  // Pass 2: Try Photon Komoot API on candidates
  for (const candidate of candidates) {
    const res = await fetchPhotonQuery(candidate);
    if (res) return res;
  }

  return null;
}

/**
 * Geocodes an address string to precise GPS coordinates (lat, lng).
 * Primary: Nominatim OpenStreetMap & Photon APIs
 */
/**
 * Checks if an address string contains explicit GPS coordinates or a valid Plus Code
 */
export function hasExplicitGpsOrPlusCode(addressStr) {
  if (!addressStr || typeof addressStr !== "string") return false;
  const s = addressStr.trim();
  // Plus code format e.g. "8Q28+XX" or "4GVJ+2JJ, ..." or "76W3+G8"
  if (/([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})\b/i.test(s)) {
    return true;
  }
  // GPS format e.g. "-6.732042, 108.552190"
  if (/(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)/.test(s)) {
    return true;
  }
  return false;
}

/**
 * Normalizes store/outlet names for robust cross-matching between checkins and master outlets
 */
export function cleanStoreName(name) {
  if (!name || typeof name !== "string") return "";
  let clean = name.toLowerCase().trim();
  // Remove common store prefixes and special punctuation
  clean = clean.replace(/^(toko|tb|ud|cv|pt|outlet|warung|kios|depot|apotek|swalayan|minimarket|grosir|agen|distributor|mitra)\s+/i, "");
  clean = clean.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  return clean;
}

/**
 * Finds a matching outlet in the master outlet list by name, kode, or clean name
 */
export function findMatchingMasterOutlet(storeQuery, masterOutlets = []) {
  if (!storeQuery || !Array.isArray(masterOutlets) || masterOutlets.length === 0) return null;
  const rawQ = String(storeQuery).trim().toLowerCase();
  const cleanQ = cleanStoreName(storeQuery);

  // 1. Exact match on nama or kode
  let match = masterOutlets.find(o => 
    (o.nama && o.nama.toLowerCase().trim() === rawQ) ||
    (o.kode && o.kode.toLowerCase().trim() === rawQ)
  );
  if (match) return match;

  // 2. Cleaned name exact match
  if (cleanQ && cleanQ.length >= 3) {
    match = masterOutlets.find(o => {
      const oClean = cleanStoreName(o.nama);
      return oClean === cleanQ;
    });
    if (match) return match;
  }

  // 3. Substring inclusion match (if query is significant length)
  if (cleanQ && cleanQ.length >= 4) {
    match = masterOutlets.find(o => {
      const oClean = cleanStoreName(o.nama);
      return oClean && (oClean.includes(cleanQ) || cleanQ.includes(oClean));
    });
    if (match) return match;
  }

  return null;
}

// Tabel referensi wilayah (dipakai baik sebagai fallback terakhir geocoding
// MAUPUN sebagai titik referensi untuk mendekode Plus Code).
const _DISTRICT_MAP = [
  // --- KOTA BATU & KABUPATEN MALANG BARAT ---
  { keywords: ["bumiaji", "punten", "tulungrejo", "selecta", "sumbergondo", "bulukerto", "giripurno", "pandanrejo", "gunungsari"], lat: -7.8170, lng: 112.5350 },
  { keywords: ["junrejo", "beji", "mojorejo", "pendem", "torongrejo", "tlekung", "dadaprejo"], lat: -7.8920, lng: 112.5650 },
  { keywords: ["batu", "sisir", "temas", "songgokerto", "oro-oro ombo", "pesanggrahan", "sumberejo", "sidomulyo", "ngaglik", "kota batu", "alun-alun batu", "wisata batu", "batos", "museum angkut", "jatim park", "bns"], lat: -7.8705, lng: 112.5271 },
  { keywords: ["pujon", "ngantang", "kasembon", "coban rondo", "santerra"], lat: -7.8400, lng: 112.4400 },

  // --- KOTA MALANG ---
  { keywords: ["lowokwaru", "dinoyo", "jatimulyo", "mojolangu", "sumbersari", "tasikmadu", "tunggulwulung", "tlogomas", "merjosari", "ketawanggede", "soekarno hatta", "suhat", "soeta", "borobudur malang", "bunga coklat", "kalpataru"], lat: -7.9430, lng: 112.6150 },
  { keywords: ["blimbing", "arjosari", "balearjosari", "polowijen", "purwantoro", "purwodadi", "bunulrejo", "pandanwangi", "kesatrian", "jodipan", "raden intan", "sulfat", "ciliwung malang"], lat: -7.9380, lng: 112.6450 },
  { keywords: ["sukun", "bandulan", "karangbesuki", "pisangcandi", "mulyorejo", "bakalankrajan", "bandungrejosari", "kebonsari", "gadang", "tanjungrejo", "ciptomulyo", "pasar besar malang", "kotalama"], lat: -7.9950, lng: 112.6150 },
  { keywords: ["kedungkandang", "sawojajar", "lesanpuro", "madyopuro", "cemorokandang", "arjowinangun", "tlogowaru", "bumiayu", "wonokoyo", "buring", "danau toba", "danau ranau", "ranugrati"], lat: -7.9900, lng: 112.6650 },
  { keywords: ["klojen", "kauman", "kiduldalem", "oro-oro dowo", "bareng", "gadingkasri", "kasin", "sukoharjo", "rampal celaket", "samaan", "penanggungan", "ijen", "alun-alun malang", "kayutangan", "kawi", "semeru", "kahuripan", "malang kota", "kota malang"], lat: -7.9797, lng: 112.6304 },

  // --- KABUPATEN MALANG ---
  { keywords: ["singosari", "lawang", "karangploso", "kepuharjo", "candirenggo", "girimoyo", "donowarih", "losari singosari", "tunjungtirto", "araya malang", "mondoroko", "bedali", "batu karangploso"], lat: -7.8920, lng: 112.6650 },
  { keywords: ["dau", "mulyoagung", "landungsari", "wagir", "pakisaji", "kebonagung", "genengan", "sengkaling", "tlogomas barat"], lat: -7.9650, lng: 112.5750 },
  { keywords: ["kepanjen", "pakis", "tumpang", "bululawang", "tajinan", "gondanglegi", "turen", "dampit", "sumberpucung", "pagelaran", "kromengan", "ngajum", "bantur", "tirtoyudo", "ampelgading", "kabupaten malang", "malang selatan"], lat: -8.1300, lng: 112.5700 },
  { keywords: ["malang", "ngalam", "arema", "malang raya"], lat: -7.9797, lng: 112.6304 },

  // --- CIREBON, BREBES, TEGAL & WEST/CENTRAL JAVA COVERAGE ---
  { keywords: ["klampok", "wanasari", "bulakamba", "losari brebes", "tanjung brebes", "jatibarang brebes", "ketanggungan", "songgom", "larangan brebes"], lat: -6.8850, lng: 109.0250 },
  { keywords: ["pagerbarang", "margasari", "slawi", "adiwerna", "dukuhturi", "talang", "kramat tegal", "suradadi", "warureja", "lebaksiu", "pangkah", "balapulang", "bumiawa", "tarub"], lat: -6.9800, lng: 109.1200 },
  { keywords: ["tegal", "margadana", "procot", "dudukati", "sumurpanggang", "tegal barat", "tegal timur", "tegal selatan", "kramat tegal"], lat: -6.8694, lng: 109.1357 },
  { keywords: ["brebes", "bumiayu", "banjarharjo"], lat: -6.8705, lng: 109.0410 },
  { keywords: ["pemalang", "comal", "randudongkal", "petarukan", "ulujami"], lat: -6.8906, lng: 109.3807 },
  { keywords: ["pekalongan", "kedungwuni", "wiradesa", "kajen"], lat: -6.8898, lng: 109.6753 },
  { keywords: ["ciledug", "pabuaran", "waled", "babakan", "gebang", "karangwareng", "karangsembung", "lemahabang", "susukan lebak", "astanajapura", "mundu", "pangenan", "losari cirebon", "cirebon timur"], lat: -6.8300, lng: 108.6800 },
  { keywords: ["arjawinangun", "ciwaringin", "gempol", "palimanan", "dukupuntang", "depok cirebon", "kembangpasetan", "susukan cirebon", "panguragan", "kaliwedi", "gegesik", "kapetakan", "surananggala", "cirebon barat"], lat: -6.6800, lng: 108.4200 },
  { keywords: ["sindanghayu", "beber"], lat: -6.8180, lng: 108.5510 },
  { keywords: ["sumber"], lat: -6.7620, lng: 108.4810 },
  { keywords: ["harjamukti"], lat: -6.7540, lng: 108.5530 },
  { keywords: ["kesambi"], lat: -6.7320, lng: 108.5480 },
  { keywords: ["lemahwungkuk"], lat: -6.7210, lng: 108.5680 },
  { keywords: ["pekalipan"], lat: -6.7220, lng: 108.5610 },
  { keywords: ["kejaksan"], lat: -6.7110, lng: 108.5580 },
  { keywords: ["weru", "plered"], lat: -6.7110, lng: 108.5020 },
  { keywords: ["cirebon kota", "cirebon"], lat: -6.7320, lng: 108.5520 },
  { keywords: ["awirarangan", "kuningan", "cilimus", "kadugede", "jalaksana", "kramatmulya", "luragung", "cidahu", "ciawigebang", "darma", "pasawahan", "mandirancan", "pancalang"], lat: -6.9730, lng: 108.4880 },
  { keywords: ["majalengka", "kadipaten", "jatiwangi", "dawuan", "kasokandel", "panyingkiran", "cigasong", "sukahaji", "rajagaluk", "sindangwangi", "leuwimunding", "palasah", "kertajati"], lat: -6.8360, lng: 108.2270 },
  { keywords: ["indramayu", "jatibarang indramayu", "karangampel", "haurgeulis", "kandanghaur", "losarang", "lohbener", "balongan", "krangkeng", "sliyeg", "juntinyuat", "anjatan", "patrol", "sukra"], lat: -6.3270, lng: 108.3240 }
];

function findDistrictReferencePoint(addressLowerCase) {
  for (const item of _DISTRICT_MAP) {
    if (item.keywords.some(kw => addressLowerCase.includes(kw))) {
      return { lat: item.lat, lng: item.lng };
    }
  }
  return null;
}

export async function geocodeAddressSmart(addressStr, fallbackSeed = 0) {
  if (!addressStr || typeof addressStr !== "string") {
    return { lat: -6.7320, lng: 108.5520, formatted: "Cirebon Center", source: "DEFAULT" };
  }

  const cleanAddr = addressStr.trim();

  // If addressStr contains explicit GPS coordinates anywhere
  const matchGps = cleanAddr.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (matchGps) {
    const lat = parseFloat(matchGps[1]);
    const lng = parseFloat(matchGps[2]);
    if (isValidOperationalCoordinate(lat, lng)) {
      return { lat, lng, formatted: cleanAddr, source: "GPS_INPUT" };
    }
  }

  // 0. Deteksi PLUS CODE (mis. "4GVJ+2JJ, Sindanghayu, ..." atau "6W6C+7GP, Sei Pinang, Mandau...")
  // -- format ini sering muncul di export aplikasi Kanal & Google Maps. Plus Code bisa
  // didekode jadi koordinat PRESISI murni pakai matematika (tanpa API), asal ada
  // "titik referensi" perkiraan wilayah untuk merekonstruksi kode pendeknya.
  const plusCodeMatch = cleanAddr.match(/\b([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})\b/i);
  if (plusCodeMatch) {
    try {
      const rawCode = plusCodeMatch[1].toUpperCase();
      
      // Jika Plus Code sudah merupakan Full Code (8+ karakter, misal "6PJX6W6C+7GP"), langsung decode presisi tinggi
      if (OpenLocationCode.isFull(rawCode)) {
        const decoded = OpenLocationCode.decode(rawCode);
        if (decoded && isValidOperationalCoordinate(decoded.latitudeCenter, decoded.longitudeCenter)) {
          return {
            lat: decoded.latitudeCenter,
            lng: decoded.longitudeCenter,
            formatted: cleanAddr,
            source: "PLUS_CODE"
          };
        }
      }

      // Jika short code (contoh: "6W6C+7GP"), ambil bagian sisa alamatnya
      const restOfAddress = cleanAddr.replace(plusCodeMatch[0], "").replace(/^[,\s]+|[,\s]+$/g, "").trim();
      let ref = findDistrictReferencePoint(restOfAddress.toLowerCase());

      // Jika belum ketemu di kamus lokal, coba cari titik koordinat area via geocoder OSM/Nominatim/Photon
      if (!ref && restOfAddress.length >= 3) {
        const areaRes = await geocodeWithOSM(restOfAddress);
        if (areaRes && isValidOperationalCoordinate(areaRes.lat, areaRes.lng)) {
          ref = { lat: areaRes.lat, lng: areaRes.lng };
        }
      }

      // Fallback default jika tidak ada info wilayah sama sekali
      if (!ref) {
        // Cek apakah ada hint Malang/Batu di string alamat
        const isMlg = /malang|batu|singosari|lawang|kepanjen|pujon|bumiaji|junrejo|dau/i.test(cleanAddr);
        ref = isMlg ? { lat: -7.9797, lng: 112.6304 } : { lat: -6.7320, lng: 108.5520 };
      }

      const fullCode = OpenLocationCode.recoverNearest(rawCode, ref.lat, ref.lng);
      const decoded = OpenLocationCode.decode(fullCode);
      if (decoded && isValidOperationalCoordinate(decoded.latitudeCenter, decoded.longitudeCenter)) {
        return {
          lat: decoded.latitudeCenter,
          lng: decoded.longitudeCenter,
          formatted: cleanAddr,
          source: "PLUS_CODE"
        };
      }
    } catch (e) {
      console.warn("Gagal decode Plus Code, lanjut ke geocoding biasa:", e);
    }
  }

  // 1. OpenStreetMap Nominatim & Photon APIs (Primary Geocoding Services)
  const osmRes = await geocodeWithOSM(cleanAddr);
  if (osmRes) {
    return osmRes;
  }

  // 2. Check if Google Maps JS API Geocoder is available
  if (window.google && window.google.maps && window.google.maps.Geocoder) {
    try {
      const candidates = generateAddressCandidates(cleanAddr);
      const geocoder = new window.google.maps.Geocoder();
      for (const candidate of candidates.slice(0, 2)) {
        const res = await new Promise((resolve) => {
          geocoder.geocode({ address: candidate }, (results, status) => {
            if (status === "OK" && results?.[0]?.geometry?.location) {
              const lat = results[0].geometry.location.lat();
              const lng = results[0].geometry.location.lng();
              if (isValidOperationalCoordinate(lat, lng)) {
                resolve({
                  lat,
                  lng,
                  formatted: results[0].formatted_address || candidate,
                  source: "GOOGLE_MAPS"
                });
              } else {
                resolve(null);
              }
            } else {
              resolve(null);
            }
          });
        });
        if (res) return res;
      }
    } catch (e) {
      console.warn("Google Maps Geocoder error:", e);
    }
  }

  // 3. Extensive Indonesian Cities & Regencies District Lookup Table
  // (tabel & fungsinya sudah diekstrak ke _DISTRICT_MAP / findDistrictReferencePoint
  // di atas, dipakai bersama dengan pendeteksi Plus Code)
  const lowerAddr = cleanAddr.toLowerCase();
  const districtRef = findDistrictReferencePoint(lowerAddr);
  const baseLat = districtRef ? districtRef.lat : -6.7320;
  const baseLng = districtRef ? districtRef.lng : 108.5520;

  // Deterministic Hash-based small offset around the identified town/city center
  let hash = 0;
  for (let i = 0; i < cleanAddr.length; i++) {
    hash = (hash << 5) - hash + cleanAddr.charCodeAt(i);
    hash |= 0;
  }
  const seed = Math.abs(hash) + (fallbackSeed * 13);
  
  const latOffset = ((seed % 1000) / 1000) * 0.015 - 0.0075;
  const lngOffset = (((seed >> 3) % 1000) / 1000) * 0.015 - 0.0075;

  const lat = Math.round((baseLat + latOffset) * 10000) / 10000;
  const lng = Math.round((baseLng + lngOffset) * 10000) / 10000;

  return {
    lat,
    lng,
    formatted: `${cleanAddr} (${lat}, ${lng})`,
    source: "CITY_LOOKUP"
  };
}

/**
 * Helper to normalize and obtain direct image URL for display (handles Google Drive, base64, etc.)
 */
export function getDirectImageUrl(url) {
  if (!url) return "";
  let s = String(url).trim();
  if (!s || s === "-" || s.toLowerCase() === "null" || s.toLowerCase() === "undefined") return "";

  // Handle HYPERLINK formula from Excel if imported as formula string e.g. =HYPERLINK("https://...", "...")
  const hyperlinkMatch = s.match(/HYPERLINK\s*\(\s*["']([^"']+)["']/i);
  if (hyperlinkMatch && hyperlinkMatch[1]) {
    s = hyperlinkMatch[1].trim();
  }

  // Strip leading/trailing quotes or brackets
  s = s.replace(/^["'(\[]+|["')\]]+$/g, "").trim();

  // If multiple URLs separated by comma or semicolon or newline, pick the first
  if (s.includes(",") || s.includes(";") || s.includes("\n")) {
    const parts = s.split(/[,;\n]/).map(p => p.trim()).filter(Boolean);
    if (parts.length > 0) s = parts[0];
  }

  if (s.startsWith("data:image/") || s.startsWith("blob:")) return s;

  // Normalisasi URL Google Drive file (file/d, open?id, uc?id, thumbnail, d/, dll.)
  const driveFileIdMatch = s.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/i) || 
                           s.match(/[?&]id=([a-zA-Z0-9_-]{20,})/i) ||
                           s.match(/\/d\/([a-zA-Z0-9_-]{20,})/i) ||
                           s.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]{20,})/i) ||
                           s.match(/drive\.usercontent\.google\.com\/download\?id=([a-zA-Z0-9_-]{20,})/i) ||
                           s.match(/drive\.google\.com\/uc\?.*?id=([a-zA-Z0-9_-]{20,})/i);

  if (driveFileIdMatch && driveFileIdMatch[1]) {
    const fileId = driveFileIdMatch[1];
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
  }

  if (/^[a-zA-Z0-9_-]{25,100}$/.test(s)) {
    return `https://drive.google.com/thumbnail?id=${s}&sz=w1000`;
  }

  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

/**
 * Standardizes salesman names to UPPERCASE and cleans irregular whitespaces
 */
export function cleanSalesName(name) {
  if (!name) return "SALESMAN";
  return String(name).trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Standardizes & cleans checkin data structure to prevent undefined property bugs
 */
export function normalizeCheckinItem(item = {}) {
  if (!item || typeof item !== "object") item = {};
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  const rawSalesNama = item.sales_nama || item.nama || item.sales_name || item.user_name || "SALESMAN";
  const sales_nama = cleanSalesName(rawSalesNama);
  const sales_nik = (item.sales_nik || item.nik || item.user_id || "SLS-001").trim();
  const toko_outlet = item.toko_outlet || item.toko || item.outlet_name || item.store_name || "Outlet Mitra";
  const alamat_toko = item.alamat_toko || item.alamat || item.address || "Cirebon";
  const koordinat_gps = item.koordinat_gps || item.gps || item.lat_long || item.coordinates || "-6.7321, 108.5523";
  const waktu_checkin = item.waktu_checkin || item.checkin_time || item.waktu || "08:30 WIB";
  const waktu_checkout = item.waktu_checkout || item.checkout_time || "09:05 WIB";
  const tanggal = item.tanggal || item.date || todayStr;
  const status_kunjungan = item.status_kunjungan || item.status || item.visit_status || "Effective Call (Order Toko)";
  const catatan = item.catatan || item.notes || "Check-in kunjungan sales";
  
  const rawPhoto = item.gambar_checkin || item.foto_checkin || item.foto_checkout || item.foto || item.foto_url || item.url_foto || item.lampiran_url || item.bukti_foto || item.checkin_photo || item.checkout_photo || item.image || item.image_url || item.photo_url || item.photo || item.url || item.gambar || item["Gambar Check In"] || item["Foto"] || item["Foto Check In"] || item["Bukti Foto"] || "";
  const gambar_checkin = getDirectImageUrl(rawPhoto);
  const foto_checkin = gambar_checkin;

  return {
    ...item,
    id: item.id ? String(item.id) : `CHK-${sales_nik}-${tanggal}-${Math.random().toString(36).substring(2,6)}`,
    sales_nama,
    sales_nik,
    toko_outlet,
    alamat_toko,
    koordinat_gps,
    waktu_checkin,
    waktu_checkout,
    tanggal,
    status_kunjungan,
    catatan,
    gambar_checkin,
    foto_checkin
  };
}

/**
 * Calculates complete route distance & leg breakdown for a salesman's checkin visits
 */
export function calculateSalesRouteMetrics(visitList, departureConfig = {}, salesNik = "") {
  const normalizedVisits = (visitList && Array.isArray(visitList)) ? visitList.map(v => normalizeCheckinItem(v)) : [];
  const sortedVisits = [...normalizedVisits].sort((a, b) => (a.waktu_checkin || "").localeCompare(b.waktu_checkin || ""));

  // Check if salesman's visits are located in Malang / Batu region
  const isMalangBatuRoute = sortedVisits.some(v => {
    const gps = parseGpsCoordinates(v.koordinat_gps);
    if (gps && gps.lng > 111.5 && gps.lat < -7.0 && gps.lat > -9.0) return true;
    const txt = ((v.alamat_toko || "") + " " + (v.toko_outlet || "")).toLowerCase();
    return /malang|batu|singosari|lawang|kepanjen|pujon|bumiaji|junrejo|dau|suhat|klojen|sukun|blimbing|sawojajar/i.test(txt);
  });

  const defaultKantorCirebon = { nama: "Kantor CV Andela Jaya Cirebon", gps: "-6.7320, 108.5520", type: "KANTOR" };
  const defaultKantorMalang = { nama: "Kantor Hub Malang - CV Andela Jaya", gps: "-7.9520, 112.6320", type: "KANTOR" };
  const regionalDefault = isMalangBatuRoute ? defaultKantorMalang : defaultKantorCirebon;
  const defaultKantor = departureConfig.kantor_default || regionalDefault;

  if (sortedVisits.length === 0) {
    const fallbackPoint = { nama: defaultKantor.nama || regionalDefault.nama, gps: defaultKantor.gps || regionalDefault.gps, type: defaultKantor.type || "KANTOR" };
    return {
      totalKm: 0,
      startPoint: fallbackPoint,
      endPoint: fallbackPoint,
      legs: []
    };
  }

  const salesCfg = (departureConfig.sales_points && departureConfig.sales_points[salesNik]) || {};

  const startName = salesCfg.start_nama || (isMalangBatuRoute && !salesCfg.start_gps ? defaultKantorMalang.nama : defaultKantor.nama);
  const startGps = salesCfg.start_gps || (isMalangBatuRoute && !salesCfg.start_gps ? defaultKantorMalang.gps : defaultKantor.gps);
  const startType = salesCfg.start_type || "KOSAN";

  const endName = salesCfg.end_nama || (isMalangBatuRoute && !salesCfg.end_gps ? defaultKantorMalang.nama : defaultKantor.nama);
  const endGps = salesCfg.end_gps || (isMalangBatuRoute && !salesCfg.end_gps ? defaultKantorMalang.gps : defaultKantor.gps);
  const endType = salesCfg.end_type || "KANTOR";

  const startCoord = parseGpsCoordinates(startGps) || (isMalangBatuRoute ? { lat: -7.9520, lng: 112.6320 } : { lat: -6.7320, lng: 108.5520 });
  const endCoord = parseGpsCoordinates(endGps) || (isMalangBatuRoute ? { lat: -7.9520, lng: 112.6320 } : { lat: -6.7320, lng: 108.5520 });

  const legs = [];
  let totalKm = 0;
  let currentCoord = startCoord;
  let currentLabel = `${startName} (${startType})`;

  sortedVisits.forEach((visit, index) => {
    const tokoOutlet = visit.toko_outlet || `Outlet ${index + 1}`;
    const alamatToko = visit.alamat_toko || (isMalangBatuRoute ? "Malang/Batu" : "Cirebon");
    const gpsVal = visit.koordinat_gps || (isMalangBatuRoute ? "-7.9797, 112.6304" : "-6.7321, 108.5523");
    let visitCoord = parseGpsCoordinates(gpsVal);
    if (!visitCoord || !isValidOperationalCoordinate(visitCoord.lat, visitCoord.lng)) {
      visitCoord = isMalangBatuRoute ? { lat: -7.9797, lng: 112.6304 } : { lat: -6.8850, lng: 109.0250 };
    }
    const dist = calcHaversineDistance(currentCoord.lat, currentCoord.lng, visitCoord.lat, visitCoord.lng);
    totalKm += dist;

    legs.push({
      legIndex: index + 1,
      visitId: visit._docId || visit.id,
      fromName: currentLabel || "Titik Keberangkatan",
      toName: tokoOutlet,
      toAddress: alamatToko,
      toGps: gpsVal,
      distanceKm: Math.round(dist * 10) / 10,
      waktuCheckin: visit.waktu_checkin || "-",
      waktuCheckout: visit.waktu_checkout || "-",
      statusKunjungan: visit.status_kunjungan || "Visit Toko",
      isEffectiveCall: (visit.status_kunjungan || "").toLowerCase().includes("effective") || visit.is_effective_call === true,
      catatan: visit.catatan || "-",
      photoUrl: visit.gambar_checkin || visit.foto_checkin || ""
    });

    currentCoord = visitCoord;
    currentLabel = tokoOutlet;
  });

  const finalLegDist = calcHaversineDistance(currentCoord.lat, currentCoord.lng, endCoord.lat, endCoord.lng);
  totalKm += finalLegDist;

  legs.push({
    legIndex: sortedVisits.length + 1,
    fromName: currentLabel || "Titik Terakhir",
    toName: `${endName} (${endType})`,
    toAddress: endName,
    toGps: endGps,
    distanceKm: Math.round(finalLegDist * 10) / 10,
    waktuCheckin: "Selesai / Pulang",
    statusKunjungan: "Kepulangan Sales"
  });

  return {
    totalKm: Math.round(totalKm * 10) / 10,
    startPoint: { nama: startName, gps: startGps, type: startType, coord: startCoord },
    endPoint: { nama: endName, gps: endGps, type: endType, coord: endCoord },
    sortedVisits,
    waypointsGps: sortedVisits.map(v => {
      const parsed = parseGpsCoordinates(v.koordinat_gps);
      if (parsed && isValidOperationalCoordinate(parsed.lat, parsed.lng)) {
        return `${parsed.lat}, ${parsed.lng}`;
      }
      return v.koordinat_gps || (isMalangBatuRoute ? "-7.9797, 112.6304" : "-6.7321, 108.5523");
    }),
    legs: legs
  };
}

/**
 * Cascades employee data changes (name, nik, jabatan, divisi, cabang, email, status)
 * across ALL Firestore collections and modules in the system.
 */
export async function cascadeEmployeeChanges(oldRecord = {}, newRecord = {}) {
  if (!oldRecord && !newRecord) return;
  const oldNik = String(oldRecord?.nik_karyawan || oldRecord?.nik || newRecord?.nik_karyawan || newRecord?.nik || "").trim();
  const newNik = String(newRecord?.nik_karyawan || newRecord?.nik || oldNik).trim();
  const oldName = String(oldRecord?.nama_karyawan || oldRecord?.nama || "").trim();
  const newName = String(newRecord?.nama_karyawan || newRecord?.nama || oldName).trim();
  const newJabatan = String(newRecord?.jabatan || "").trim();
  const newDivisi = String(newRecord?.divisi || "").trim();
  const newCabang = String(newRecord?.cabang || "").trim();
  const newEmail = String(newRecord?.email || "").trim();
  const newStatus = String(newRecord?.aktif_tdk_aktif || newRecord?.status_karyawan || "").trim();

  if (!oldNik && !newNik && !oldName && !newName) return;

  console.log(`[CASCADE] Propagating employee update: "${oldName}" (${oldNik}) -> "${newName}" (${newNik})`);

  const promises = [];

  // 1. Sync COL.USERS (users)
  promises.push((async () => {
    try {
      const users = await fsGetAll(COL.USERS).catch(() => []);
      for (const u of users) {
        const uNik = String(u.nik || u.username || u.id || "").trim();
        const uNama = String(u.nama || "").trim();
        const isMatch = (oldNik && (uNik === oldNik || u.username === oldNik)) ||
                        (oldName && uNama.toLowerCase() === oldName.toLowerCase());
        if (isMatch) {
          const patch = {};
          if (newName && u.nama !== newName) patch.nama = newName;
          if (newNik && u.nik !== newNik) patch.nik = newNik;
          if (newJabatan && u.jabatan !== newJabatan) patch.jabatan = newJabatan;
          if (newDivisi && u.divisi !== newDivisi) patch.divisi = newDivisi;
          if (newCabang && u.cabang !== newCabang) patch.cabang = newCabang;
          if (newEmail && u.email !== newEmail) patch.email = newEmail;
          if (newStatus && u.status !== newStatus) patch.status = newStatus;
          if (Object.keys(patch).length > 0) {
            await fsUpdate(COL.USERS, u.id, patch).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.warn("Cascade USERS err:", e);
    }
  })());

  // 2. Sync atasan in COL.MASTER_KARYAWAN
  if (oldName && newName && oldName.toLowerCase() !== newName.toLowerCase()) {
    promises.push((async () => {
      try {
        const emps = await fsGetAll(COL.MASTER_KARYAWAN).catch(() => []);
        for (const e of emps) {
          if (e.atasan && String(e.atasan).trim().toLowerCase() === oldName.toLowerCase()) {
            await fsUpdate(COL.MASTER_KARYAWAN, e.id, { atasan: newName }).catch(() => {});
          }
        }
      } catch (e) {
        console.warn("Cascade atasan err:", e);
      }
    })());
  }

  // 3. Generic helper for collections with employee records
  const updateCollectionMatching = async (colName, nikFields, nameFields, extraFields = {}) => {
    try {
      const rows = await fsGetAll(colName).catch(() => []);
      for (const r of rows) {
        let matched = false;
        const patch = {};

        for (const nf of nikFields) {
          const val = String(r[nf] || "").trim();
          if (oldNik && val === oldNik) {
            matched = true;
            if (newNik && val !== newNik) patch[nf] = newNik;
          }
        }
        for (const nmf of nameFields) {
          const val = String(r[nmf] || "").trim();
          if (oldName && val.toLowerCase() === oldName.toLowerCase()) {
            matched = true;
            if (newName && val !== newName) patch[nmf] = newName;
          }
        }

        if (matched) {
          for (const [k, v] of Object.entries(extraFields)) {
            if (v && r[k] !== v && r[k] !== undefined) patch[k] = v;
          }
          if (Object.keys(patch).length > 0) {
            await fsUpdate(colName, r.id, patch).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.warn(`Cascade ${colName} err:`, e);
    }
  };

  // 4. Update across all HR and operational modules
  promises.push(updateCollectionMatching(COL.DATA_PENGAJUAN, ["nik_pemohon", "nik_karyawan", "nik"], ["nama_pemohon", "nama_karyawan", "nama", "nama_staf"], { jabatan: newJabatan, divisi: newDivisi, cabang: newCabang }));
  promises.push(updateCollectionMatching(COL.DATA_ABSENSI, ["nik_karyawan", "nik"], ["nama_karyawan", "nama", "nama_staf"], { jabatan: newJabatan, divisi: newDivisi, cabang: newCabang }));
  promises.push(updateCollectionMatching(COL.LOG_LEMBUR, ["nik_karyawan", "nik"], ["nama_karyawan", "nama"], { jabatan: newJabatan, divisi: newDivisi }));
  promises.push(updateCollectionMatching(COL.LOG_KASBON, ["nik_karyawan", "nik"], ["nama_karyawan", "nama"], { jabatan: newJabatan, divisi: newDivisi }));
  promises.push(updateCollectionMatching(COL.MASTER_CUTI, ["nik_karyawan", "nik"], ["nama_karyawan", "nama"]));
  promises.push(updateCollectionMatching(COL.DATA_REIMBURSEMENT, ["nik_pemohon", "nik_karyawan", "nik"], ["nama_pemohon", "nama_karyawan", "nama"]));
  promises.push(updateCollectionMatching(COL.SIGN_DOCUMENTS, ["nik_penerima", "nik"], ["nama_penerima", "nama_karyawan", "nama"]));
  promises.push(updateCollectionMatching(COL.LOG_PENILAIAN_KPI, ["nik_karyawan", "nik"], ["nama_karyawan", "nama", "nama_penilai"]));
  promises.push(updateCollectionMatching(COL.TUGAS_KPI_360, ["nik_karyawan", "nik_penilai"], ["nama_karyawan", "nama_penilai"]));
  promises.push(updateCollectionMatching(COL.LOG_PENILAIAN_HARIAN, ["nik_karyawan", "nik"], ["nama_karyawan", "nama"]));
  promises.push(updateCollectionMatching(COL.TARGET_BULANAN_KPI, ["nik_karyawan", "nik"], ["nama_karyawan", "nama"]));
  promises.push(updateCollectionMatching(COL.EVALUASI_KONTRAK, ["nik_karyawan", "nik"], ["nama_karyawan", "nama"]));
  promises.push(updateCollectionMatching(COL.MASTER_KONTRAK, ["nik_karyawan", "nik"], ["nama_karyawan", "nama"]));
  promises.push(updateCollectionMatching(COL.PERFORMANCE_REVIEW, ["nik_karyawan", "nik"], ["employee_name", "nama_karyawan", "nama"]));
  promises.push(updateCollectionMatching(COL.DATA_PEMANGGILAN, ["nik_karyawan", "nik"], ["nama_karyawan", "nama"]));
  promises.push(updateCollectionMatching(COL.LOG_SP_KONSELING, ["nik_karyawan", "nik"], ["nama_karyawan", "nama"]));
  promises.push(updateCollectionMatching(COL.SIKLUS_KARYAWAN, ["nik_karyawan", "nik"], ["nama_karyawan", "nama"]));
  promises.push(updateCollectionMatching(COL.UANG_MAKAN_EXPEDISI, ["nik_karyawan", "nik"], ["nama_karyawan", "nama_driver", "nama"]));
  promises.push(updateCollectionMatching(COL.MASTER_KENDARAAN, [], ["pemegang_kendaraan", "driver", "nama_driver"]));
  promises.push(updateCollectionMatching(COL.LOG_INVENTORY_PENGAMBILAN, ["nik_peminjam"], ["nama_peminjam", "nama_karyawan"]));
  promises.push(updateCollectionMatching("sales_order", ["sales_nik", "nik_sales"], ["sales_nama", "nama_sales", "salesman"]));
  promises.push(updateCollectionMatching("sales_outlet", ["sales_nik", "nik_sales"], ["sales_nama", "nama_sales"]));
  promises.push(updateCollectionMatching("sales_task", ["sales_nik", "nik_sales"], ["sales_nama", "nama_sales"]));
  promises.push(updateCollectionMatching("kanal_checkins", ["sales_nik"], ["sales_nama"], { sales_jabatan: newJabatan }));
  promises.push(updateCollectionMatching("sales_odometer", ["sales_nik"], ["sales_nama"]));
  promises.push(updateCollectionMatching("klaim_bensin", ["nik_pemohon", "nik_karyawan", "nik"], ["nama_pemohon", "nama_karyawan", "nama"]));

  // 5. Update local session storage if current user
  try {
    const rawSession = localStorage.getItem("aj_session");
    if (rawSession) {
      const sess = JSON.parse(rawSession);
      const isSess = (oldNik && (sess.nik === oldNik || sess.username === oldNik)) ||
                     (oldName && sess.nama && sess.nama.toLowerCase() === oldName.toLowerCase());
      if (isSess) {
        if (newName) sess.nama = newName;
        if (newNik) sess.nik = newNik;
        if (newJabatan) sess.jabatan = newJabatan;
        if (newDivisi) sess.divisi = newDivisi;
        if (newCabang) sess.cabang = newCabang;
        if (newEmail) sess.email = newEmail;
        localStorage.setItem("aj_session", JSON.stringify(sess));
      }
    }
  } catch (e) {}

  await Promise.all(promises);
  console.log(`[CASCADE] Successfully synchronized "${newName}" across all modules.`);
}

/**
 * Performs a global synchronization of all Master Karyawan records into all related modules.
 */
export async function syncAllEmployeesAcrossCollections() {
  const emps = await fsGetAll(COL.MASTER_KARYAWAN).catch(() => []);
  if (!emps.length) return 0;
  for (const emp of emps) {
    await cascadeEmployeeChanges(emp, emp);
  }
  return emps.length;
}

