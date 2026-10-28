export function GET() { return Response.redirect(process.env.ACIES_SITE_URL || "http://127.0.0.1:3000", 307); }
