import "server-only";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { create, get, list, update } from "./db";
import { body, HttpError, json, rateLimit, requireUser, text } from "./security";
import { articleCategories, type Article, type ArticleContent, type PublishedArticle } from "./editorial-types";
import type { Media } from "./types";

export async function publishedArticles(): Promise<PublishedArticle[]> {
  return (await list<Article>("articles")).flatMap(a => a.published && Date.parse(a.published.publishedAt) <= Date.now() ? [a.published] : []).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
export async function publicEditorial(request: NextRequest) {
  if (request.method !== "GET") throw new HttpError("Not found.", 404);
  // Explicit projection: draft text, user identifiers and internal revisions never leave this boundary.
  return Response.json({ articles: await publishedArticles() }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
function content(data: Record<string, unknown>): ArticleContent {
  const category = text(data, "category");
  if (!articleCategories.includes(category as ArticleContent["category"])) throw new HttpError("Choose a category.");
  const sponsor = text(data, "sponsor", 160), sponsorUrl = text(data, "sponsorUrl", 500);
  if (sponsorUrl) {
    try { const u = new URL(sponsorUrl); if (u.protocol !== "https:" || u.username || u.password || !sponsor) throw new Error(); }
    catch { throw new HttpError("Use a full https sponsor URL and name the sponsor."); }
  }
  return { title: text(data, "title", 160, true), summary: text(data, "summary", 400), body: text(data, "body", 18000), category: category as ArticleContent["category"], author: text(data, "author", 160), imageId: text(data, "imageId", 100), imageAlt: text(data, "imageAlt", 250), imageCredit: text(data, "imageCredit", 250), sponsor, sponsorUrl, correction: text(data, "correction", 1200) };
}
export async function editorialAction(request: NextRequest, path: string[]) {
  const actor = await requireUser(request);
  const editor = actor.role === "editor" || (actor.role === "staff" && actor.owner);
  if (!editor && actor.role !== "writer") throw new HttpError("Editorial access is required.", 403);
  if (request.method === "GET") return json({ articles: (await list<Article>("articles")).filter(a => editor || a.userId === actor.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), canPublish: Boolean(editor) });
  const data = await body(request);
  await rateLimit(`editorial:${actor.id}`, 60, 600_000);
  const action = text(data, "action", 20, true);
  if (!path[0] && request.method === "POST" && action === "create") {
    const id = randomUUID(), now = new Date().toISOString();
    const article: Article = { id, slug: id, userId: actor.id, title: "Untitled story", summary: "", body: "", category: "News", author: actor.name, imageId: "", imageAlt: "", imageCredit: "", sponsor: "", sponsorUrl: "", correction: "", revision: 1, createdAt: now, updatedAt: now, status: "Draft", published: null };
    return json({ article: await create("articles", article) }, 201);
  }
  if (request.method !== "PATCH" || !path[0] || path.length !== 1) throw new HttpError("Not found.", 404);
  const article = await update<Article>("articles", path[0], async (current): Promise<Article> => {
    if (!editor && current.userId !== actor.id) throw new HttpError("This story is not available to your account.", 403);
    if (data.revision !== current.revision) throw new HttpError("This story changed. Reopen it before saving your changes.", 409);
    const now = new Date().toISOString();
    const next = { ...current, revision: current.revision + 1, updatedAt: now };
    if (action === "save") {
      const fields = content(data);
      if (fields.imageId) {
        const image = await get<Media>("media", fields.imageId);
        if (!image || image.projectId || image.purpose || !image.mime.startsWith("image/") || (image.userId !== actor.id && fields.imageId !== current.imageId)) throw new HttpError("Choose an image uploaded for this story.", 403);
      }
      return { ...next, ...fields, status: "Draft" };
    }
    if (action === "submit") {
      if (current.body.length < 100 || !current.summary || !current.author) throw new HttpError("Add a summary, author and at least 100 characters of story text before review.");
      return { ...next, status: "In review" };
    }
    if (!editor) throw new HttpError("An editor must make publishing decisions.", 403);
    if (action === "unpublish") return { ...next, published: null, status: "Draft" };
    if (action !== "publish") throw new HttpError("Choose a supported action.");
    if (current.body.length < 100 || !current.summary || !current.author || (current.imageId && (!current.imageAlt || !current.imageCredit))) throw new HttpError("Add the story, summary, author, and image description and credit before publishing.");
    const supplied = text(data, "publishAt", 50);
    const timestamp = supplied ? Date.parse(supplied) : Date.now();
    if (!Number.isFinite(timestamp) || timestamp < Date.now() - 60_000) throw new HttpError("Choose a valid publication time now or in the future.");
    // Slugs are stable after first publication. UUID suffix avoids races between matching titles.
    const slug = current.slug !== current.id ? current.slug : `${current.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "story"}-${current.id}`;
    const { title, summary, body: story, category, author, imageId, imageAlt, imageCredit, sponsor, sponsorUrl, correction } = current;
    const publishedAt = current.published?.publishedAt || new Date(timestamp).toISOString();
    const published: PublishedArticle = { id: current.id, slug, title, summary, body: story, category, author, imageId, imageAlt, imageCredit, sponsor, sponsorUrl, correction, publishedAt, updatedAt: now };
    return { ...next, slug, published, status: Date.parse(publishedAt) > Date.now() ? "Scheduled" : "Published" };
  });
  await create("audit", { id: randomUUID(), actorId: actor.id, action: `Editorial: ${action}`, targetId: article.id, createdAt: new Date().toISOString() });
  return json({ article });
}
