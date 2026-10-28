import { Suspense } from "react";
import { Portal } from "../ui/portal";
export default function PortalPage() { return <Suspense fallback={<div className="opening">Getting things together…</div>}><Portal /></Suspense>; }
