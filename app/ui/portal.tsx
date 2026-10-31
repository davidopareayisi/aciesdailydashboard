"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { SafeUser } from "../lib/types";
import { AuthScreen, PrivacyScreen, VerifyScreen } from "./auth";
import { api, Empty, ErrorNotice, Wordmark } from "./shared";
import { MemberApp } from "./member-app";
import { StaffApp } from "./staff-app";
import { Editorial } from "./editorial";

export function Portal() {
  const pathname = usePathname(), router = useRouter(), [user, setUser] = useState<SafeUser | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => { let active = true; api<{ user: SafeUser | null }>("auth/session").then((data) => { if (active) setUser(data.user); }).catch(() => { if (active) setError("We couldn't connect to the portal. Please refresh to try again."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  function onUser(user: SafeUser) { setUser(user); setError(""); router.push(!user.verifiedAt ? "/verify" : ["staff", "writer", "editor"].includes(user.role) ? "/team" : user.role === "creative" ? (pathname === "/learn" || pathname.startsWith("/learn/") ? pathname : "/home") : "/projects"); }
  async function onLogout() { try { await api("auth/logout", "POST", {}); setUser(null); router.push("/login"); } catch (error) { setError((error as Error).message); } }
  if (pathname === "/privacy") return <PrivacyScreen />;
  if (loading) return <div className="opening"><Wordmark /><p role="status">Getting things together…</p></div>;
  if (!user || pathname === "/forgot") return <><ErrorNotice message={error} /><AuthScreen key={pathname} mode={pathname === "/register" ? "register" : pathname === "/forgot" ? "forgot" : "login"} onUser={onUser} /></>;
  if (!user.verifiedAt) return <VerifyScreen user={user} onUser={onUser} onLogout={onLogout} />;
  if (user.role === "writer" || user.role === "editor") return <><header className="app-header"><Wordmark /><button className="button outline" onClick={onLogout}>Sign out</button></header><main className="app-main editorial-workspace"><Editorial /></main></>;
  if (pathname.startsWith("/team") && user.role !== "staff") return <main className="app-main"><Empty title="This area is for the AciesDaily team." text="Your creative or client account has its own space." href="/home" action="Your portal" /></main>;
  return <><ErrorNotice message={error} />{user.role === "staff" ? <StaffApp user={user} pathname={pathname.startsWith("/team") ? pathname : "/team"} onLogout={onLogout} /> : <MemberApp user={user} pathname={pathname} onLogout={onLogout} />}</>;
}
