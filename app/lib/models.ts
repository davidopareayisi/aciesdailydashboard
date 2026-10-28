import type { Enquiry, ContentEntry } from "./business";
export type Project = Enquiry & { clientId?: string };
export type PublishedEntry = ContentEntry & { userId?: string };
export function projectView(entry: Project) {
  return { id: entry.id, createdAt: entry.createdAt, projectType: entry.projectType, location: entry.location, status: entry.status || "New", coordinator: entry.coordinator || "", shootDate: entry.shootDate || "", proposal: entry.proposal || "", quote: entry.quote || "", clientMessage: entry.clientMessage || "", deliverables: entry.deliverables || [], approvedAt: entry.approvedAt || "", updatedAt: entry.updatedAt || entry.createdAt };
}
