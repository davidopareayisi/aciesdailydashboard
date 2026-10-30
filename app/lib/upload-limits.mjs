// Leave room for multipart overhead below Vercel's 4.5 MB request limit.
export const MAX_UPLOAD_BYTES = 4_000_000;
export const MAX_UPLOAD_REQUEST_BYTES = 4_200_000;
export const UPLOAD_LIMIT_LABEL = "4 MB";
