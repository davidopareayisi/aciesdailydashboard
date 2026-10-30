import type { NextRequest } from "next/server";
import { learningAction, staffLearningAction } from "../../lib/learning-actions";
import { authAction } from "../../lib/auth-actions";
import { approveProject, contentEntries, userAction } from "../../lib/domain";
import { staffAction } from "../../lib/staff-actions";
import { download, upload } from "../../lib/media";
import { body, equal, HttpError, json } from "../../lib/security";
import { get } from "../../lib/db";
import { createEnquiry } from "../../lib/enquiry-intake";
import { connectionStatus, requestFailure } from "../../lib/diagnostics";
import { collections, type Collection } from "../../lib/business";
import { projectView, type Project } from "../../lib/models";

type Context = { params: Promise<{ route: string[] }> };
async function handle(request: NextRequest, context: Context): Promise<Response> {
  try {
    const { route: path } = await context.params;
    if (path[0] === "learn") return await learningAction(request, path.slice(1));
    if (path[0] === "staff" && path[1] === "learn") return await staffLearningAction(request, path.slice(2));
    if (path[0] === "auth") return await authAction(request, path[1]);
    if (path[0] === "portal") return await userAction(request, path.slice(1));
    if (path[0] === "staff" || path[0] === "admin") return await staffAction(request, path.slice(1));
    if (path[0] === "upload" && request.method === "POST") return await upload(request);
    if (path[0] === "media" && request.method === "GET") return await download(request, path[1]);
    if (path[0] === "content" && request.method === "GET" && collections.includes(path[1] as Collection)) {
      const entries = (await contentEntries(path[1] as Collection, true)).map(({ userId: ignoredId, ...entry }) => { void ignoredId; return entry; }); return json({ entries });
    }
    if (path[0] === "bridge" && path[1] === "status" && request.method === "GET") return await connectionStatus(request);
    if (path[0] === "bridge" && path[1] === "enquiries" && request.method === "POST") return await createEnquiry(request);
    if (path[0] === "projects" && path[1]) {
      const token = request.headers.get("authorization")?.replace(/^Bearer /, "") || "", entry = await get<Project>("enquiries", path[1]);
      if (!entry || entry.kind !== "project" || !entry.accessToken || token.length < 40 || token.length > 100 || !equal(token, entry.accessToken)) throw new HttpError("This private project link is unavailable. Ask your coordinator for the complete link.", 404);
      if (request.method === "GET") return json({ project: projectView(entry) });
      if (request.method === "POST") { const data = await body(request), updated = await approveProject(entry.id, data, (current) => Boolean(current.accessToken && equal(token, current.accessToken))); return json({ project: projectView(updated) }); }
    }
    throw new HttpError("Not found.", 404);
  } catch (error) { return error instanceof HttpError ? json({ error: error.message }, error.status) : requestFailure(error); }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
