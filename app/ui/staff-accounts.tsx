"use client";
import { useState } from "react";
import { api, ErrorNotice, useResource } from "./shared";

type Account = { id: string; name: string; phone: string; role: string; owner?: boolean; disabled?: boolean };
export function StaffAccounts() {
  const resource = useResource<{ accounts: Account[] }>("staff/accounts");
  const [busy, setBusy] = useState(""), [error, setError] = useState("");
  return <section className="surface"><h2>Account access.</h2><p>Disable an account to revoke its sessions and prevent sign-in. Records are preserved. Owner accounts are protected.</p>
    <ErrorNotice message={error || resource.error} />
    {resource.loading && <p role="status">Opening accounts…</p>}
    {resource.data?.accounts.map(account => <div className="summary-row" key={account.id}><div><strong>{account.name}</strong><p>{account.role} · {account.phone} · {account.disabled ? "Disabled" : "Active"}</p></div>
      {!account.owner && <button type="button" className="quiet-link" disabled={Boolean(busy)} onClick={async () => {
        setBusy(account.id); setError("");
        try { await api(`staff/accounts/${account.id}`, "PATCH", { disabled: !account.disabled }); await resource.refresh(); }
        catch (error) { setError((error as Error).message); }
        finally { setBusy(""); }
      }}>{busy === account.id ? "Saving…" : account.disabled ? "Restore access" : "Disable access"}</button>}
    </div>)}
  </section>;
}
