"use client";
import Link from "next/link";
import { dateLabel, ErrorNotice, useResource } from "./shared";

type Operations = {
  stages: { status: string; count: number }[]; totalBriefs: number; approvedProposals: number; bookedOrBeyond: number;
  medianResponseHours: number | null; responseSampleSize: number; pendingReviews: number; awaitingConfirmation: number;
  waiting: { id: string; title: string; createdAt: string }[];
  upcoming: { id: string; title: string; date: string }[];
  conflicts: { id: string; title: string; date: string; reason: string }[];
};
export function OperationsScreen() {
  const resource = useResource<Operations>("staff/operations");
  const data = resource.data;
  return <><div className="page-heading"><span className="eyebrow">Keep the work moving</span><h1>Follow-ups & progress.</h1><p>Your current pipeline, upcoming productions and decisions waiting for the team.</p></div>
    <ErrorNotice message={resource.error} />{resource.loading && <p role="status">Opening progress…</p>}
    {data && <>
      <div className="overview-counts">{data.stages.map(stage => <Link href="/team/enquiries" key={stage.status}><span>{stage.status}</span><strong>{stage.count}</strong></Link>)}</div>
      <div className="staff-overview-grid">
        <section className="surface"><h2>Follow up today.</h2><p>{data.waiting.length} new enquiries have waited at least 24 hours. {data.pendingReviews} profiles need review; {data.awaitingConfirmation} accepted invitations need confirmation.</p>
          {data.waiting.slice(0, 20).map(item => <Link className="summary-row" href="/team/enquiries" key={item.id}><span>{item.title}<small> · {item.id} · {dateLabel(item.createdAt)}</small></span></Link>)}
          <p><Link className="text-link" href="/team/people">Review profiles</Link> · <Link className="text-link" href="/team/productions">Confirm bookings</Link></p>
        </section>
        <section className="surface"><h2>Production pipeline.</h2><p>{data.approvedProposals} approved proposals; {data.bookedOrBeyond} briefs booked or progressed beyond booking, out of {data.totalBriefs} project briefs.</p>
          <p>{data.medianResponseHours === null ? "Response-time tracking starts when a new enquiry is marked Contacted." : `Median time to first Contacted status: ${data.medianResponseHours.toFixed(1)} hours (${data.responseSampleSize} recorded briefs).`}</p>
          <p className="fine-print">Stage counts show current status. Older records may not have milestone history. Mark Contacted after your first response; status changes alone do not send messages.</p>
        </section>
        <section className="surface"><h2>Upcoming productions.</h2>{data.upcoming.length ? data.upcoming.map(item => <Link className="summary-row" href="/team/productions" key={item.id}><span>{item.title} · {dateLabel(item.date)}</span></Link>) : <p>No upcoming confirmed bookings.</p>}</section>
        <section className="surface"><h2>Scheduling warnings.</h2>{data.conflicts.length ? data.conflicts.map(item => <p key={item.id}>{item.title} · {dateLabel(item.date)}<br />{item.reason}</p>) : <p>No conflicts found among upcoming confirmed bookings and declared unavailable dates.</p>}<p className="fine-print">Check travel and call times with the creative. These checks do not reserve a date or replace coordination.</p></section>
      </div>
    </>}
  </>;
}
