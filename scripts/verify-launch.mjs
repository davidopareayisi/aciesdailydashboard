import assert from "node:assert/strict";
import { test } from "node:test";
import { bookingConflicts, operationsSummary } from "../app/lib/operations.mjs";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_REQUEST_BYTES } from "../app/lib/upload-limits.mjs";

test("multipart uploads leave room beneath the hosting request limit", () => {
  const body = new FormData();
  body.set("file", new File([new Uint8Array(MAX_UPLOAD_BYTES)], "practice.webm"));
  return new Response(body).arrayBuffer().then(bytes => {
    assert.ok(bytes.byteLength <= MAX_UPLOAD_REQUEST_BYTES);
    assert.ok(MAX_UPLOAD_REQUEST_BYTES < 4_500_000);
  });
});
test("pipeline metrics do not invent historic contact times or include network enquiries", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");
  const summary = operationsSummary([
    { id: "one", kind: "project", status: "Contacted", createdAt: "2026-10-29T00:00:00Z", milestones: { Contacted: "2026-10-29T02:00:00Z" } },
    { id: "two", kind: "project", status: "Booked", approvedAt: "2026-10-29", createdAt: "2026-10-28T00:00:00Z" },
    { id: "three", kind: "network", status: "New", createdAt: "2026-10-28T00:00:00Z" },
  ], [], [], now);
  assert.equal(summary.totalBriefs, 2);
  assert.equal(summary.medianResponseHours, 2);
  assert.equal(summary.responseSampleSize, 1);
  assert.equal(summary.waiting.length, 1);
  assert.equal(summary.approvedProposals, 1);
  assert.equal(summary.bookedOrBeyond, 1);
});
test("scheduling warns about unavailable dates and other bookings without conflicting with itself", () => {
  const invitation = { id: "one", userId: "creative", date: "2026-11-01", booking: "Confirmed" };
  assert.deepEqual(bookingConflicts(invitation, { availability: "Available" }, [invitation]), []);
  assert.equal(bookingConflicts(invitation, { unavailableDates: [invitation.date] }, []).length, 1);
  assert.equal(bookingConflicts(invitation, { availability: "Unavailable" }, []).length, 1);
  assert.equal(bookingConflicts(invitation, {}, [{ ...invitation, id: "two" }]).length, 1);
  assert.deepEqual(bookingConflicts(invitation, {}, [{ ...invitation, id: "two", booking: "Cancelled" }]), []);
});
