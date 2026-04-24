// ===========================================
// File Content Validation — Magic Bytes Check
// Prevents disguised files (e.g., .exe renamed to .pdf)
// ===========================================

/** File signatures (magic bytes) for allowed types */
const MAGIC_BYTES: Record<string, number[][]> = {
  "application/pdf": [
    [0x25, 0x50, 0x44, 0x46], // %PDF
  ],
  "image/jpeg": [
    [0xff, 0xd8, 0xff],
  ],
  "image/png": [
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  ],
};

/**
 * Verify file magic bytes match the claimed MIME type.
 * Throws if the file content doesn't match.
 */
export function verifyFileContent(buffer: Buffer, declaredMimeType: string): void {
  const signatures = MAGIC_BYTES[declaredMimeType];
  if (!signatures) {
    throw new Error(`ไม่รองรับไฟล์ประเภท ${declaredMimeType}`);
  }

  const matched = signatures.some((sig) =>
    sig.every((byte, i) => buffer[i] === byte)
  );

  if (!matched) {
    throw new Error(
      `ไฟล์ดูไม่ใช่ประเภท ${declaredMimeType} จริง — อาจเป็นไฟล์อันตรายที่ปลอมแปลงนามสกุล`
    );
  }
}

/** Maximum allowed file sizes by type */
export const MAX_FILE_SIZES = {
  "application/pdf": 10 * 1024 * 1024, // 10 MB
  "image/jpeg": 10 * 1024 * 1024,
  "image/png": 10 * 1024 * 1024,
} as const;

/**
 * Validate uploaded file — MIME type, magic bytes, size.
 * Call this before processing any uploaded file.
 */
export function validateUploadedFile(file: {
  type: string;
  size: number;
}, buffer: Buffer): void {
  // 1. MIME whitelist
  const allowedMimes = Object.keys(MAGIC_BYTES);
  if (!allowedMimes.includes(file.type)) {
    throw new Error(`รองรับเฉพาะ ${allowedMimes.join(", ")}`);
  }

  // 2. Size limit
  const maxSize = MAX_FILE_SIZES[file.type as keyof typeof MAX_FILE_SIZES];
  if (file.size > maxSize) {
    throw new Error(`ไฟล์ใหญ่เกิน ${maxSize / 1024 / 1024} MB`);
  }

  // 3. Magic bytes match
  verifyFileContent(buffer, file.type);
}
