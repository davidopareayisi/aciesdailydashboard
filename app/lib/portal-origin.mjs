const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** @param {Request} request @param {string | undefined} configuredUrl */
export function isPortalOrigin(request, configuredUrl) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const requestUrl = new URL(request.url);
    const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host") || requestUrl.host;
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || requestUrl.protocol.slice(0, -1);
    const destination = new URL(`${protocol}://${host}`);
    const configured = configuredUrl ? new URL(configuredUrl) : destination;
    if (origin === configured.origin) return true;

    // Local aliases work only on the configured protocol and port. Live domains stay exact.
    const source = new URL(origin);
    return origin === source.origin && [source, destination, configured].every((url) =>
      loopbackHosts.has(url.hostname) &&
      url.protocol === configured.protocol &&
      url.port === configured.port
    );
  } catch {
    return false;
  }
}
