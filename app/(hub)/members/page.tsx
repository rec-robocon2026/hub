import type { Metadata } from "next";
import { approveMember, rejectMember, updateMember } from "@/app/(hub)/actions";
import { ActionForm, FormNotice, Submit } from "@/components/action-form";
import { Box, Empty, PageHead, Tag } from "@/components/ui";
import { displayName, requireMember } from "@/lib/auth";
import { loadMembers } from "@/lib/data";
import { DISCIPLINE_LABEL, timeAgo } from "@/lib/format";
import type { Member, Role } from "@/lib/types";

export const metadata: Metadata = { title: "Members" };

const ROLE_ORDER: Role[] = ["lead", "member", "pending", "alum"];

export default async function MembersPage() {
  const { supabase, isLead, member: me } = await requireMember();
  const members = await loadMembers(supabase);
  const pending = members.filter((m) => m.role === "pending");
  const rest = members
    .filter((m) => m.role !== "pending")
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || displayName(a).localeCompare(displayName(b)));

  return (
    <main className="page">
      <PageHead
        kicker="Club"
        title="Members"
        sub={`${rest.filter((m) => m.role === "lead").length} leads · ${rest.filter((m) => m.role === "member").length} members · ${rest.filter((m) => m.role === "alum").length} alumni`}
      />
      <p className="text-muted lede" style={{ marginTop: -16, marginBottom: 32 }}>
        Everyone signs in with Google and arrives pending. A lead approves them as a member or lead and sets their batch
        year. Members read everything and add things; leads also approve, delete and mark as-built. Alumni lose access.
      </p>

      {isLead && (
        <section style={{ marginBottom: 44 }}>
          <h3 style={{ margin: "0 0 16px" }}>Waiting for approval</h3>
          {pending.length ? (
            <div className="stack">
              {pending.map((m) => (
                <Box key={m.id} className="pad">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 15 }}>{displayName(m)}</div>
                      <div className="text-muted small">{m.email} · signed in {timeAgo(m.created_at)}</div>
                    </div>
                    <form action={approveMember} className="inline-form">
                      <input type="hidden" name="member_id" value={m.id} />
                      <input name="batch" className="input" placeholder="batch, e.g. 25/27" style={{ width: 140 }} />
                      <DepartmentSelect />
                      <button className="btn btn-primary" type="submit" name="role" value="member">Approve as member</button>
                      <button className="btn btn-secondary" type="submit" name="role" value="lead">Approve as lead</button>
                    </form>
                  </div>
                  <form action={rejectMember} style={{ marginTop: 6 }}>
                    <input type="hidden" name="member_id" value={m.id} />
                    <button className="btn btn-ghost" type="submit" style={{ fontSize: 12 }}>Reject</button>
                  </form>
                </Box>
              ))}
            </div>
          ) : (
            <Empty title="Nobody waiting" body="New sign-ins appear here. Tell new members to sign in with their student Google account." />
          )}
        </section>
      )}

      <h3 style={{ margin: "0 0 16px" }}>Everyone</h3>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Batch</th>
              <th>Department</th>
              {isLead && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rest.map((m) =>
              isLead || m.id === me.id ? (
                <EditableRow key={m.id} m={m} canSetRole={isLead} isMe={m.id === me.id} />
              ) : (
                <tr key={m.id}>
                  <td>
                    {displayName(m)}
                    <div className="text-muted small">{m.email}</div>
                  </td>
                  <td><Tag kind={m.role === "lead" ? "accent" : "neutral"}>{m.role.toUpperCase()}</Tag></td>
                  <td className="small">{m.batch ?? "—"}</td>
                  <td className="small">{m.department ? DISCIPLINE_LABEL[m.department] : "—"}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function EditableRow({ m, canSetRole, isMe }: { m: Member; canSetRole: boolean; isMe: boolean }) {
  const formId = `member-${m.id}`;
  return (
    <tr>
      <td>
        {displayName(m)} {isMe && <span className="text-muted small">(you)</span>}
        <div className="text-muted small">{m.email}</div>
      </td>
      <td>
        {canSetRole ? (
          <select form={formId} name="role" className="input" defaultValue={m.role} style={{ minHeight: 30, padding: "3px 8px", fontSize: 13 }}>
            <option value="member">Member</option>
            <option value="lead">Lead</option>
            <option value="alum">Alum (no access)</option>
          </select>
        ) : (
          <Tag kind={m.role === "lead" ? "accent" : "neutral"}>{m.role.toUpperCase()}</Tag>
        )}
      </td>
      <td>
        <input form={formId} name="batch" className="input" defaultValue={m.batch ?? ""} placeholder="25/27" style={{ width: 90, minHeight: 30, padding: "3px 8px", fontSize: 13 }} />
      </td>
      <td>
        <DepartmentSelect form={formId} defaultValue={m.department ?? ""} />
      </td>
      <td>
        {/* the inputs in this row attach via form=, so the row stays a table row */}
        <ActionForm id={formId} action={updateMember} className="inline-form">
          <input type="hidden" name="member_id" value={m.id} />
          <Submit>Save</Submit>
          <FormNotice />
        </ActionForm>
      </td>
    </tr>
  );
}

function DepartmentSelect({ form, defaultValue = "" }: { form?: string; defaultValue?: string }) {
  return (
    <select form={form} name="department" className="input" defaultValue={defaultValue} style={{ width: "auto", minHeight: 30, padding: "3px 8px", fontSize: 13 }}>
      <option value="">no department</option>
      <option value="mech">Mechanical</option>
      <option value="elec">Electronics</option>
      <option value="prog">Programming</option>
    </select>
  );
}
