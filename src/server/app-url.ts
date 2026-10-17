/**
 * The public origin. Behind Render's proxy `request.url` is the internal
 * http://localhost:10000, so redirects and absolute links must use APP_BASE_URL.
 */
export function appUrl(path = "/"): URL {
  return new URL(path, process.env.APP_BASE_URL ?? "http://localhost:3000");
}
