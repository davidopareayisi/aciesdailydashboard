import { Suspense } from "react";
import { LegacyProject } from "../../ui/project-screen";
export default async function PrivateProject({ params }: { params: Promise<{ id: string }> }) { return <Suspense fallback={<div className="opening">Opening your project…</div>}><ProjectContent params={params} /></Suspense>; }
async function ProjectContent({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <LegacyProject id={id} />; }
