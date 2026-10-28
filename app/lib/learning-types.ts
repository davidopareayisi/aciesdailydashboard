export type Lesson = {
  id: string; courseId: string; order: number; title: string; category: string; summary: string;
  notes: string; checklist: string[]; practice: string; videoUrl: string;
  creator: string; sourceUrl: string; sourceTitle: string; published: boolean; updatedAt: string;
};
export type LearningProgress = { id: string; userId: string; lessonId: string; completed: boolean; updatedAt: string };
export type PracticeAttempt = { number: number; note: string; media: string[]; submittedAt: string; status: "Awaiting feedback" | "Keep practising" | "Reviewed"; feedback: string; reviewer: string; reviewedAt: string };
export type PracticeSubmission = { id: string; userId: string; lessonId: string; attempts: PracticeAttempt[]; updatedAt: string };
export type LearningCourse = { id: string; order: number; title: string; level: string; summary: string; outcomes: string[] };
export type LearningLibrary = { courses: LearningCourse[]; lessons: Lesson[]; progress: LearningProgress[]; submissions: PracticeSubmission[] };
export type ReviewLibrary = { courses: LearningCourse[]; lessons: Lesson[]; submissions: (PracticeSubmission & { learnerName: string })[] };
