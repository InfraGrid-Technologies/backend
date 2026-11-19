import { createWorker } from "tesseract.js";

let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker("eng");
      return worker;
    })();
  }
  return workerPromise;
}

/**
 * Recognizes text from image buffer with a strict timeout guard (8s).
 */
async function recognizeTextWithTimeout(imageBuffer, timeoutMs = 8000) {
  try {
    const worker = await getWorker();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("OCR recognition timed out")),
        timeoutMs,
      );
    });
    const result = await Promise.race([
      worker.recognize(imageBuffer),
      timeoutPromise,
    ]);
    return result?.data?.text || "";
  } catch (err) {
    workerPromise = null;
    return "";
  }
}

/**
 * Inspects binary magic bytes at offset 0 to verify true file format.
 * Blocks malicious binaries, scripts, or non-images disguised as .jpg/.png.
 */
export function verifyImageMagicBytes(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 12) {
    return { valid: false, format: "unknown" };
  }

  // 1. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, format: "image/jpeg" };
  }

  // 2. PNG: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { valid: true, format: "image/png" };
  }

  // 3. PDF: 25 50 44 46 (%PDF)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return { valid: true, format: "application/pdf" };
  }

  // 4. WebP: RIFF .... WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, format: "image/webp" };
  }

  return { valid: false, format: "unknown" };
}

// ---------------------------------------------------------------------------
// DOCUMENT DISTINCTION REGEX PATTERNS
// ---------------------------------------------------------------------------

// Keywords exclusive to Vehicle Registration Certificates (RC Cards)
const RC_EXCLUSIVE_PATTERNS = [
  /REGISTRATION\s*CERTIFICATE/i,
  /CERTIFICATE\s*OF\s*REGISTRATION/i,
  /FORM\s*23\b/i,
  /CHASSIS\s*(?:NO|NUMBER)?/i,
  /\bVIN\b/i,
  /ENGINE\s*(?:NO|NUMBER)?/i,
  /UNLADEN\s*WEIGHT/i,
  /GROSS\s*VEHICLE\s*WEIGHT/i,
  /VEHICLE\s*RC\b/i,
  /RC\s*CARD\b/i,
  /SEATING\s*CAPACITY/i,
  /CUBIC\s*CAPACITY\b/i,
  /HORSE\s*POWER\b/i,
  /CYLINDERS\b/i,
  /FUEL\s*USED\b/i,
  /REGN\.?\s*(?:NO|MARK|NUMBER)\b/i,
  /REGISTRATION\s*(?:NO|MARK|NUMBER)\b/i,
  /BODY\s*TYPE\b/i,
  /MAKER\s*NAME\b/i,
  /WHEEL\s*BASE\b/i,
];

// Keywords exclusive to Driving Licenses (DL Cards)
const DL_EXCLUSIVE_PATTERNS = [
  /DRIVING\s*LICEN[CS]E/i,
  /DRIVER\s*LICEN[CS]E/i,
  /UNION\s*OF\s*INDIA\s*DRIVING/i,
  /INDIAN\s*UNION\s*DRIVING/i,
  /AUTHORIS(?:ATION|ED)?\s*TO\s*DRIVE/i,
  /FORM\s*7\b/i,
  /\bSARATHI\b/i,
  /\bDL\s*(?:NO|NUMBER|#)\b/i,
  /\bLICEN[CS]E\s*(?:NO|NUMBER|#)\b/i,
  /\bBADGE\s*(?:NO|NUMBER)\b/i,
  /VALIDITY\s*\((?:NT|TR)\)/i,
  /NON-TRANSPORT\b/i,
  /CLASS\s*OF\s*VEHICLE[S]?\s*(?:LMV|MCWG|TRANS|HMV|HGV|CEV)/i,
  /\bCOV\s*[:\s-]\s*(?:LMV|MCWG|TRANS)/i,
];

// Standard Indian Vehicle Registration Number (e.g. TS16FD7966, DL01AB1234, MH12CD5678)
const VEHICLE_REG_NUMBER_REGEX =
  /\b[A-Z]{2}[-\s]?[0-9]{1,2}[-\s]?[A-Z]{1,3}[-\s]?[0-9]{4}\b/i;

// Standard Indian Driving License Number format:
// State (2 letters) + RTO code (2 digits) + 4-digit Year (e.g. 2011, 2021) + 7 digits
// e.g. TS0920210001234, MH14 20110062821, DL-0420110149646
const DL_NUMBER_STRICT_REGEX =
  /\b[A-Z]{2}[-\s]?[0-9]{2}[-\s]?(?:19[89][0-9]|20[0-2][0-9])[-\s]?[0-9]{7}\b/i;
const DL_NUMBER_SLASH_REGEX =
  /\b[A-Z]{2}[-\s]?[0-9]{2}\/(?:19[89][0-9]|20[0-2][0-9])\/[0-9]{5,7}\b/i;
const DL_NUMBER_GENERIC_REGEX = /\b[A-Z]{2}[0-9]{13,15}\b/i;

/**
 * Validates whether an uploaded image is a physical Driving License.
 *
 * Guards against:
 * 1. Corrupted / blank images (buffer < 2KB or illegible text).
 * 2. Cross-document mismatch: Rejects Vehicle RC cards uploaded to DL screen.
 * 3. Non-documents (walls, selfies, random photos).
 */
export async function validateDlDocumentImage(imageBuffer) {
  if (
    !imageBuffer ||
    !Buffer.isBuffer(imageBuffer) ||
    imageBuffer.length < 2048
  ) {
    return {
      isDocument: false,
      message:
        "Invalid Document Image: The uploaded file is too small or corrupted. Please upload a clear photo of your Driving License.",
    };
  }

  const magic = verifyImageMagicBytes(imageBuffer);
  if (!magic.valid) {
    return {
      isDocument: false,
      message:
        "Invalid File Format: The uploaded document is not a genuine image (JPEG/PNG/PDF). Please upload an authentic photo of your physical Driving License.",
    };
  }

  const rawText = await recognizeTextWithTimeout(imageBuffer);
  const text = rawText.trim();

  // If OCR could not extract any meaningful text
  if (!text || text.length < 15) {
    return {
      isDocument: false,
      message:
        "Invalid Document Image: Could not read legible text from the uploaded photo. Please ensure your physical Driving License is well-lit, fully visible, and not blurry or obstructed.",
    };
  }

  // Count matches
  const rcMatchCount = RC_EXCLUSIVE_PATTERNS.filter((pattern) =>
    pattern.test(text),
  ).length;
  const dlMatchCount = DL_EXCLUSIVE_PATTERNS.filter((pattern) =>
    pattern.test(text),
  ).length;

  const hasStrictDlNumber =
    DL_NUMBER_STRICT_REGEX.test(text) ||
    DL_NUMBER_SLASH_REGEX.test(text) ||
    DL_NUMBER_GENERIC_REGEX.test(text);

  // 1. Cross-document Guard: Check if the user accidentally uploaded a Vehicle RC card to the DL screen
  if (rcMatchCount >= 2 && dlMatchCount === 0 && !hasStrictDlNumber) {
    return {
      isDocument: false,
      message:
        "Invalid Document Image: The uploaded document appears to be a Vehicle Registration Certificate (RC), not a Driving License. Please upload a clear photo of your Driving License.",
    };
  }

  // 2. Validate that at least ONE explicit DL indicator is present
  const hasDlGeneralKeywords =
    /(?:DRIVING|DRIVER|LICEN[CS]E|SARATHI|AUTHORIS(?:ATION|ED)?\s*TO\s*DRIVE)/i.test(
      text,
    );
  const hasDob =
    /(?:Date\s*Of\s*Birth|DOB|Birth\s*Date|D\.O\.B|[0-3]?[0-9][/-][0-1]?[0-9][/-][12][90][0-9]{2})/i.test(
      text,
    );

  const isValidDl =
    dlMatchCount > 0 || hasStrictDlNumber || (hasDlGeneralKeywords && hasDob);

  if (!isValidDl) {
    return {
      isDocument: false,
      message:
        "Invalid Document Image: The uploaded photo does not appear to be a valid physical Driving License. Please ensure your physical card is clearly visible, well-lit, and not a random photo.",
    };
  }

  return {
    isDocument: true,
  };
}

/**
 * Validates whether an uploaded image is a physical Vehicle Registration Certificate (RC).
 *
 * Guards against:
 * 1. Corrupted / blank images (buffer < 2KB or illegible text).
 * 2. Cross-document mismatch: Rejects Driving Licenses uploaded to RC screen.
 * 3. Non-documents (walls, selfies, random photos).
 */
export async function validateRcDocumentImage(imageBuffer) {
  if (
    !imageBuffer ||
    !Buffer.isBuffer(imageBuffer) ||
    imageBuffer.length < 2048
  ) {
    return {
      isDocument: false,
      message:
        "Invalid Document Image: The uploaded file is too small or corrupted. Please upload a clear photo of your RC card.",
    };
  }
  
  const magic = verifyImageMagicBytes(imageBuffer);
  if (!magic.valid) {
    return {
      isDocument: false,
      message:
        "Invalid File Format: The uploaded document is not a genuine image (JPEG/PNG/PDF). Please upload an authentic photo of your physical RC card.",
    };
  }

  const rawText = await recognizeTextWithTimeout(imageBuffer);
  const text = rawText.trim();

  // If OCR could not extract any meaningful text
  if (!text || text.length < 15) {
    return {
      isDocument: false,
      message:
        "Invalid Document Image: Could not read legible text from the uploaded photo. Please ensure your physical RC card is well-lit, fully visible, and not blurry or obstructed.",
    };
  }

  // Count matches
  const rcMatchCount = RC_EXCLUSIVE_PATTERNS.filter((pattern) =>
    pattern.test(text),
  ).length;
  const dlMatchCount = DL_EXCLUSIVE_PATTERNS.filter((pattern) =>
    pattern.test(text),
  ).length;

  const hasVehicleReg = VEHICLE_REG_NUMBER_REGEX.test(text);
  const hasChassis =
    /(?:Chassis|Chass\.?|VIN)\s*(?:No\.?|Number)?\s*[:\s-]*[A-Z0-9*]{6,25}/i.test(
      text,
    );
  const hasEngine =
    /(?:Engine|Eng\.?)\s*(?:No\.?|Number)?\s*[:\s-]*[A-Z0-9*]{6,25}/i.test(
      text,
    );

  // 1. Cross-document Guard: Check if the user accidentally uploaded a Driving License to the RC screen
  if (dlMatchCount >= 2 && rcMatchCount === 0 && !hasChassis && !hasEngine) {
    return {
      isDocument: false,
      message:
        "Invalid Document Image: The uploaded document appears to be a Driving License, not a Vehicle Registration Certificate (RC). Please upload a clear photo of your RC card.",
    };
  }

  // 2. Validate that at least ONE explicit RC indicator or registration/chassis/engine is present
  const hasRcGeneralKeywords =
    /(?:REGISTRATION|CERTIFICATE|MOTOR\s*VEHICLE|PARIVAHAN|VAHAN|FORM\s*23)/i.test(
      text,
    );

  const isValidRc =
    rcMatchCount > 0 ||
    hasChassis ||
    hasEngine ||
    (hasVehicleReg && hasRcGeneralKeywords);

  if (!isValidRc) {
    return {
      isDocument: false,
      message:
        "Invalid Document Image: The uploaded photo does not appear to be a valid physical Vehicle Registration Certificate (RC). Please ensure your physical card is clearly visible, well-lit, and not a random photo.",
    };
  }

  return {
    isDocument: true,
  };
}

// Backward-compatible aliases for existing imports
export async function extractDlFromImageBuffer(imageBuffer) {
  return validateDlDocumentImage(imageBuffer);
}

export async function extractRcFromImageBuffer(imageBuffer) {
  return validateRcDocumentImage(imageBuffer);
}
