import "server-only";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { create, find, get, list, save, update } from "./db";
import { body, hash, HttpError, json, rateLimit, requireStaff, requireUser, strings, text } from "./security";
import { notify, now } from "./domain";
import { starterLessons } from "./learning-catalog.mjs";
import { courseMetadata, learningCourses } from "./learning-courses.mjs";
import { hostedVideo, youtubeId } from "./learning-video.mjs";
import type { Audit, Media, User } from "./types";
import type { LearningProgress, Lesson, PracticeAttempt, PracticeSubmission } from "./learning-types";

export async function learningLessons() {
  const merged = new Map((starterLessons as unknown as Lesson[]).map(lesson => [lesson.id, lesson]));
  for (const lesson of await list<Lesson>("lessons")) merged.set(lesson.id, lesson);
  const courseOrder = new Map(learningCourses.map(course => [course.id, course.order]));
  return [...merged.values()].map(lesson => ({ ...lesson, ...courseMetadata(lesson) })).sort((a, b) => (courseOrder.get(a.courseId) || 1) - (courseOrder.get(b.courseId) || 1) || a.order - b.order || a.title.localeCompare(b.title));
}
function identifier(value: string | undefined) {
  if (!value || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,120}$/.test(value)) throw new HttpError("This lesson is unavailable.", 404);
  return value;
}
export async function learningAction(request: NextRequest, path: string[]) {
  const user = await requireUser(request);
  if (path[0] === "files" && request.method === "GET") {
    const file = await get<Media>("media", identifier(path[1]));
    if (!file || file.purpose !== "learning" || (user.role !== "staff" && file.userId !== user.id)) throw new HttpError("File not found.", 404);
    return json({ mime: file.mime, filename: file.filename });
  }
  if (user.role !== "creative") throw new HttpError("Learning is available to creative accounts.", 403);
  const lessons = (await learningLessons()).filter(lesson => lesson.published);
  if (!path.length && request.method === "GET") return json({ courses: learningCourses.filter(course => lessons.some(lesson => lesson.courseId === course.id)), lessons, progress: (await find<LearningProgress>("learningProgress", "userId", user.id)), submissions: (await find<PracticeSubmission>("learningSubmissions", "userId", user.id)) });
  const id = identifier(path[0]), lesson = lessons.find(item => item.id === id);
  if (!lesson) throw new HttpError("This lesson is unavailable.", 404);
  const data = await body(request), recordId = `learn-${hash(`${user.id}:${id}`)}`;
  if (path[1] === "progress" && request.method === "PATCH") {
    if (typeof data.completed !== "boolean") throw new HttpError("Choose whether you have completed the lesson.");
    const progress: LearningProgress = { id: recordId, userId: user.id, lessonId: id, completed: data.completed, updatedAt: now() };
    await save("learningProgress", progress); return json({ progress });
  }
  if (path[1] === "practice" && request.method === "POST") {
    await rateLimit(`practice:${user.id}`, 12, 3600_000);
    if (!lesson.practice || data.consent !== true) throw new HttpError("Confirm that this practice may be shared privately with the AciesDaily team.");
    const note = text(data, "note", 2000, true), media = strings(data, "media", 4);
    if (!media.length) throw new HttpError("Add your practice photos or short video.");
    for (const mediaId of media) {
      identifier(mediaId); const file = await get<Media>("media", mediaId);
      if (!file || file.userId !== user.id || file.purpose !== "learning" || file.projectId) throw new HttpError("Choose files from your own private practice uploads.", 403);
    }
    const attempt = (number: number): PracticeAttempt => ({ number, note, media, submittedAt: now(), status: "Awaiting feedback", feedback: "", reviewer: "", reviewedAt: "" });
    let existing = await get<PracticeSubmission>("learningSubmissions", recordId);
    if (!existing) {
      try { const submission: PracticeSubmission = { id: recordId, userId: user.id, lessonId: id, attempts: [attempt(1)], updatedAt: now() }; await create("learningSubmissions", submission); return json({ submission }, 201); }
      catch (error) { existing = await get<PracticeSubmission>("learningSubmissions", recordId); if (!existing) throw error; }
    }
    const submission = await update<PracticeSubmission>("learningSubmissions", recordId, current => {
      const latest = current.attempts.at(-1)!;
      if (latest.status === "Awaiting feedback") throw new HttpError("Your latest practice is already with the team. Wait for feedback before submitting again.", 409);
      if (current.attempts.length >= 10) throw new HttpError("Please contact the team before adding another attempt.");
      return { ...current, attempts: [...current.attempts, attempt(latest.number + 1)], updatedAt: now() };
    });
    return json({ submission }, 201);
  }
  throw new HttpError("Not found.", 404);
}

export async function staffLearningAction(request: NextRequest, path: string[]) {
  const actor = await requireStaff(request);
  if (!path.length && request.method === "GET") {
    const users = new Map((await list<User>("users")).map(user => [user.id, user.name]));
    return json({ courses: learningCourses, lessons: await learningLessons(), submissions: (await list<PracticeSubmission>("learningSubmissions")).map(item => ({ ...item, learnerName: users.get(item.userId) || "Creative account" })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
  }
  const data = await body(request);
  if (path[0] === "lessons" && request.method === "POST") {
    const id = data.id ? identifier(text(data, "id", 120)) : randomUUID();
    let videoUrl = text(data, "videoUrl", 1000); const videoId = youtubeId(videoUrl);
    if (videoUrl && !videoId && !hostedVideo(videoUrl)) throw new HttpError("Use a YouTube link or an HTTPS MP4/WebM video link.");
    if (videoId) videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    let sourceUrl = text(data, "sourceUrl", 1000);
    if (sourceUrl) { try { const url = new URL(sourceUrl); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); sourceUrl = url.href; } catch { throw new HttpError("Use a full HTTPS resource link."); } }
    const courseId = text(data, "courseId", 120, true);
    if (!learningCourses.some(course => course.id === courseId)) throw new HttpError("Choose a course from the learning library.");
    const creator = text(data, "creator", 160);
    if (videoUrl && !creator) throw new HttpError("Credit the video creator.");
    const order = Number(data.order); if (!Number.isInteger(order) || order < 1 || order > 999) throw new HttpError("Use a lesson order between 1 and 999.");
    const lesson: Lesson = { id, courseId, title: text(data, "title", 160, true), category: text(data, "category", 100, true), summary: text(data, "summary", 500, true), notes: text(data, "notes", 8000, true), checklist: strings(data, "checklist", 8), practice: text(data, "practice", 1500), videoUrl, creator, sourceUrl, sourceTitle: text(data, "sourceTitle", 160), order, published: data.published === true, updatedAt: now() };
    await save("lessons", lesson); await create<Audit>("audit", { id: randomUUID(), actorId: actor.id, action: lesson.published ? "Published learning lesson" : "Saved learning draft", targetId: id, createdAt: now() });
    return json({ lesson });
  }
  if (path[0] === "reviews" && request.method === "PATCH") {
    const id = identifier(path[1]), feedback = text(data, "feedback", 3000, true);
    if (!["Keep practising", "Reviewed"].includes(String(data.status))) throw new HttpError("Choose a feedback outcome.");
    const submission = await update<PracticeSubmission>("learningSubmissions", id, current => {
      const latest = current.attempts.at(-1)!;
      if (latest.number !== data.attempt || latest.status !== "Awaiting feedback") throw new HttpError("This practice has changed or was already reviewed. Refresh before reviewing.", 409);
      const reviewed: PracticeAttempt = { ...latest, status: data.status as PracticeAttempt["status"], feedback, reviewer: actor.name, reviewedAt: now() };
      return { ...current, attempts: [...current.attempts.slice(0, -1), reviewed], updatedAt: now() };
    });
    await notify(submission.userId, "Your practice feedback is ready", `The team has reviewed your practice. Open Learn to see the feedback.`, `/learn/${submission.lessonId}`);
    await create<Audit>("audit", { id: randomUUID(), actorId: actor.id, action: "Reviewed private learning practice", targetId: submission.id, createdAt: now() });
    return json({ submission });
  }
  throw new HttpError("Not found.", 404);
}
