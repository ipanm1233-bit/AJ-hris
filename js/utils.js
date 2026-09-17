Warning: truncated output (original token count: 87440)
Total output lines: 8219

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
import { authFetch } from "./api-client.js";

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
export function fmtDateIndo(value, opts = {}) {
	const d = smartParseDate(value);
	if (!d) return "-";
	return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta", ...opts });
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
  if (!id) return null;
  const cleanId = String(id).trim();
  if (!cleanId) return null;
  const snap = await getDoc(doc(db, colName, cleanId));
  return snap.exists() ? { id: snap.id, _docId: snap.id, ...snap.data() } : null;
}
export async function fsAdd(colName, data, customId = null) {
  const payload = cleanFirestorePayload(data) || {};
  if (customId) {
    const cleanId = String(customId).trim();
    await setDoc(doc(db, colName, cleanId), { ...payload, created_at: serverTimestamp() });
    return cleanId;
  }
  const ref = await addDoc(collection(db, colName), { ...payload, created_at: serverTimestamp() });
  return ref.id;
}
export async function fsUpdate(colName, id, data) {
  if (!id) {
    console.warn(`fsUpdate called with empty id for collection ${colName}`);
    throw new Error(`ID dokumen tidak valid untuk pembaruan koleksi ${colName}`);
  }
  const cleanId = String(id).trim();
  const payload = cleanFirestorePayload(data) || {};
  await setDoc(doc(db, colName, cleanId), { ...payload, updated_at: serverTimestamp() }, { merge: true });
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

/**
 * Ekspor Dokumen Resmi format Microsoft Word (.doc) berbasis MIME HTML Word Document.
 * Kompatibel penuh dengan Microsoft Word (Desktop/Office 365), LibreOffice Writer,
 * Google Docs, dan WPS Office.
 */
export function downloadWordDoc({
 filename = "document.doc",
 title = "Laporan Resmi",
 subtitle = "CV ANDELA JAYA",
 meta = [],
 tables = [],
 customHtmlBefore = "",
 customHtmlAfter = "",
 signatures = []
}) {
 const metaHtml = meta && meta.length ? `
 <table style="width:100%; border:none; margin-bottom:14px; font-size:10pt;">
 ${meta.map(m => `
 <tr>
 <td style="width:180px; font-weight:bold; color:#475569; border:none; padding:3px 0; vertical-align:top;">${escapeHtml(m.label || m.key || '')}</td>
 <td style="width:15px; border:none; padding:3px 0; vertical-align:top;">:</td>
 <td style="color:#0f172a; border:none; padding:3px 0; vertical-align:top;">${escapeHtml(String(m.value ?? '-'))}</td>
 </tr>
 `).join('')}
 </table>
 ` : '';

 const tablesHtml = (tables || []).map((t) => {
 const tTitle = t.title ? `<h3 style="font-size:11pt; color:#7f1d1d; margin:16px 0 6px 0; font-weight:bold;">${escapeHtml(t.title)}</h3>` : '';
 const tSubtitle = t.subtitle ? `<p style="font-size:9pt; color:#64748b; margin:0 0 8px 0;">${escapeHtml(t.subtitle)}</p>` : '';
 const tHeaders = t.headers && t.headers.length ? `
 <thead>
 <tr style="background-color:#7f1d1d; color:#ffffff;">
 ${t.headers.map(h => `<th style="border:1px solid #7f1d1d; background-color:#7f1d1d; color:#ffffff; padding:7px 6px; font-size:9pt; text-align:left; font-weight:bold;">${escapeHtml(h)}</th>`).join('')}
 </tr>
 </thead>
 ` : '';
 const tRows = (t.rows || []).map((r, rIdx) => {
 const bg = rIdx % 2 === 1 ? 'background-color:#f8fafc;' : 'background-color:#ffffff;';
 return `
 <tr style="${bg}">
 ${r.map((c, cIdx) => {
 const align = t.aligns && t.aligns[cIdx] ? `text-align:${t.aligns[cIdx]};` : '';
 const isRawHtml = typeof c === 'string' && (c.includes('<span') || c.includes('<div') || c.includes('<b'));
 const content = isRawHtml ? c : escapeHtml(String(c ?? '-'));
 return `<td style="border:1px solid #cbd5e1; padding:6px; font-size:9pt; vertical-align:top; color:#1e293b; ${align}">${content}</td>`;
 }).join('')}
 </tr>
 `;
 }).join('');

 return `
 ${tTitle}
 ${tSubtitle}
 <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
 ${tHeaders}
 <tbody>
 ${tRows || '<tr><td colspan="100%" style="text-align:center; padding:12px; color:#94a3b8;">Tidak ada data tercatat</td></tr>'}
 </tbody>
 </table>
 `;
 }).join('');

 const sigHtml = signatures && signatures.length ? `
 <table style="width:100%; border:none; margin-top:35px; page-break-inside:avoid; font-size:9.5pt;">
 <tr>
 ${signatures.map(s => `
 <td style="border:none; text-align:center; width:${Math.floor(100 / signatures.length)}%; vertical-align:top; padding:0 10px;">
 <div style="font-weight:normal; color:#475569; margin-bottom:55px;">${escapeHtml(s.role || 'Mengetahui,')}<br><strong style="color:#1e293b;">${escapeHtml(s.title || '')}</strong></div>
 <div style="font-weight:bold; text-decoration:underline; color:#0f172a;">${escapeHtml(s.name || '( .................................... )')}</div>
 ${s.nip ? `<div style="font-size:8.5pt; color:#64748b; margin-top:2px;">NIK: ${escapeHtml(s.nip)}</div>` : ''}
 </td>
 `).join('')}
 </tr>
 </table>
 ` : '';

 const docHtml = `
 <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
 <head>
 <meta charset='utf-8'>
 <title>${escapeHtml(title)}</title>
 <!--[if gte mso 9]>
 <xml>
 <w:WordDocument>
 <w:View>Print</w:View>
 <w:Zoom>100</w:Zoom>
 <w:DoNotOptimizeForBrowser/>
 </w:WordDocument>
 </xml>
 <![endif]-->
 <style>
 @page Section1 {
 size: 841.9pt 595.3pt;
 margin: 0.8in 0.8in 0.8in 0.8in;
 mso-header-margin: 0.5in;
 mso-footer-margin: 0.5in;
 mso-paper-source: 0;
 }
 div.Section1 { page: Section1; }
 body { font-family: 'Calibri', 'Segoe UI', 'Arial', sans-serif; font-size: 10pt; color: #1e293b; line-height: 1.4; }
 h1, h2, h3, h4 { font-family: 'Calibri', 'Arial', sans-serif; }
 </style>
 </head>
 <body>
 <div class="Section1">
 <div style="border-bottom: 2.5px solid #7f1d1d; padding-bottom: 8px; margin-bottom: 14px;">
 <table style="width:100%; border:none; margin:0;">
 <tr>
 <td style="border:none; vertical-align:middle;">
 <div style="font-size:15pt; font-weight:bold; color:#7f1d1d; letter-spacing:0.5px;">${escapeHtml(title)}</div>
 <div style="font-size:9.5pt; font-weight:bold; color:#334155; margin-top:2px;">${escapeHtml(subtitle)}</div>
 </td>
 <td style="border:none; text-align:right; vertical-align:middle;">
 <div style="display:inline-block; border:1px solid #7f1d1d; padding:3px 7px; font-weight:bold; font-size:8pt; color:#7f1d1d; border-radius:4px;">
 DOKUMEN RESMI INTERNAL
 </div>
 </td>
 </tr>
 </table>
 </div>
 ${metaHtml}
 ${customHtmlBefore || ''}
 ${tablesHtml}
 ${customHtmlAfter || ''}
 ${sigHtml}
 </div>
 </body>
 </html>
 `;

 const blob = new Blob(["\uFEFF" + docHtml], { type: "application/msword;charset=utf-8" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 const cleanFilename = filename.endsWith(".doc") ? filename : filename.replace(/\.[^/.]+$/, "") + ".doc";
 a.href = url;
 a.download = cleanFilename;
 document.body.appendChild(a);
 a.click();
 a.remove();
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
 const blobUrl = URL.createO…57440 tokens truncated…bel class="block text-[11px] font-bold text-slate-600 mb-1">Nama Lengkap *</label>
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
            const response = await authFetch('/api/admin-user', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
              username: uname,
              nama: nama,
              nik: nik || "-",
              role: role,
              email: email || "",
              no_hp: phone || "",
              password: pword
              })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) throw new Error(result.error || 'Gagal membuat akun Firebase.');
            
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

          const sent = await sendEmailNotif(email, `[Undangan HRIS] Kredensial Login - ${COMPANY_NAME}`, htmlEmail, "", null, { manual: true });
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
            await sendEmailNotif(email, `[Undangan HRIS] Kredensial Login - ${COMPANY_NAME}`, htmlEmail, "", null, { manual: true });
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
 * @param {Function} onProgress - Callback function receiving ({ current, total, percentage, currentEmployee })
 */
export async function syncAllEmployeesAcrossCollections(onProgress = null) {
  const emps = await fsGetAll(COL.MASTER_KARYAWAN).catch(() => []);
  if (!emps.length) return 0;
  let count = 0;
  for (const emp of emps) {
    await cascadeEmployeeChanges(emp, emp);
    count++;
    if (typeof onProgress === "function") {
      try {
        onProgress({
          current: count,
          total: emps.length,
          percentage: Math.round((count / emps.length) * 100),
          currentEmployee: emp.nama_karyawan || emp.nama || `Karyawan #${count}`
        });
      } catch (eCb) {
        console.warn("onProgress callback error:", eCb);
      }
    }
  }
  return count;
}

export async function requestEditAuth(options = {}) {
  if (window.requestEditAuth) return window.requestEditAuth(options);
  const { requestEditAuth: authFn } = await import("./auth.js");
  return authFn(options);
}
