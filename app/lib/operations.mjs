/** Staff-only aggregate reporting; never send the source records to analytics providers. */
export function operationsSummary(projects, profiles, invitations, clock = Date.now()) {
  const today = new Date(clock).toISOString().slice(0, 10);
  const briefs = projects.filter(item => item.kind === "project");
  const stages = ["New", "Contacted", "Quoted", "Booked", "In production", "Delivered", "Closed"].map(status => ({ status, count: briefs.filter(item => (item.status || "New") === status).length }));
  const waiting = projects.filter(item => (!item.status || item.status === "New") && clock - Date.parse(item.createdAt) >= 24 * 3600_000);
  const responded = briefs.filter(item => item.milestones?.Contacted && Date.parse(item.milestones.Contacted) >= Date.parse(item.createdAt));
  const responseHours = responded.map(item => (Date.parse(item.milestones.Contacted) - Date.parse(item.createdAt)) / 3600_000).filter(Number.isFinite).sort((a, b) => a - b);
  const middle = Math.floor(responseHours.length / 2);
  const median = responseHours.length ? (responseHours.length % 2 ? responseHours[middle] : (responseHours[middle - 1] + responseHours[middle]) / 2) : null;
  const conflicts = [];
  const confirmed = invitations.filter(item => item.booking === "Confirmed" && item.date >= today);
  for (const item of confirmed) {
    const profile = profiles.find(profile => profile.id === item.userId);
    const other = confirmed.find(candidate => candidate.id !== item.id && candidate.userId === item.userId && candidate.date === item.date);
    if (other || profile?.unavailableDates?.includes(item.date) || profile?.availability === "Unavailable") conflicts.push({ id: item.id, title: item.title, date: item.date, reason: other ? "Another confirmed booking on the same day" : "Creative marked unavailable" });
  }
  return {
    stages, totalBriefs: briefs.length, approvedProposals: briefs.filter(item => item.approvedAt).length,
    bookedOrBeyond: briefs.filter(item => ["Booked", "In production", "Delivered"].includes(item.status) || item.milestones?.Booked).length,
    responseSampleSize: responseHours.length, medianResponseHours: median,
    waiting: waiting.map(item => ({ id: item.id, title: item.projectType || item.role || "Enquiry", createdAt: item.createdAt })),
    pendingReviews: profiles.filter(item => item.status === "Pending review").length,
    awaitingConfirmation: invitations.filter(item => item.response === "Accepted" && item.booking === "Unconfirmed").length,
    upcoming: confirmed.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10).map(item => ({ id: item.id, title: item.title, date: item.date })),
    conflicts,
  };
}

export function bookingConflicts(invitation, profile, invitations) {
  const reasons = [];
  if (profile?.availability === "Unavailable" || profile?.unavailableDates?.includes(invitation.date)) reasons.push("The creative has marked this date unavailable.");
  if (invitations.some(item => item.id !== invitation.id && item.userId === invitation.userId && item.date === invitation.date && item.booking === "Confirmed")) reasons.push("The creative already has a confirmed booking on this date.");
  return reasons;
}
