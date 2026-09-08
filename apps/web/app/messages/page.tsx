import Link from "next/link";

import { startGuardianThreadAction } from "@/app/actions/communication";
import { AppShell, StatusNote } from "@/components/app-shell";
import { MessageThread } from "@/components/message-thread";
import { requireViewer } from "@/lib/auth";
import { communicationNavigation } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ thread?: string; before?: string }> }) {
  const viewer = await requireViewer(["school_admin", "teacher", "guardian"]);
  const state = await searchParams;
  const supabase = await createClient();
  const feature = await supabase.from("school_feature_settings").select("is_enabled").eq("school_id", viewer.schoolId!).eq("feature_key", "messaging").maybeSingle();
  if (!feature.data?.is_enabled) return <AppShell eyebrow={viewer.schoolName ?? "School"} title="Messages" nav={communicationNavigation(viewer.role!)}><StatusNote tone="warning">Messaging is not enabled for this school.</StatusNote></AppShell>;

  const [threads, reads, guardianLinks] = await Promise.all([
    supabase.from("message_threads").select("id, child_id, guardian_membership_id, updated_at, children(preferred_name)").eq("status", "active").order("updated_at", { ascending: false }).limit(50),
    supabase.from("message_thread_reads").select("thread_id, last_read_at").eq("membership_id", viewer.membershipId!),
    viewer.role === "guardian" ? supabase.from("child_guardians").select("child_id, children(preferred_name)").eq("guardian_membership_id", viewer.membershipId!).eq("status", "active") : Promise.resolve({ data: [] }),
  ]);
  const readAt = new Map(reads.data?.map((item) => [item.thread_id, item.last_read_at]));
  const selected = threads.data?.find((thread) => thread.id === state.thread) ?? threads.data?.[0];
  let messages = selected ? supabase.from("messages").select("id, body, created_at, sender_user_id, sender_membership_id").eq("thread_id", selected.id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(30) : null;
  if (messages && state.before) messages = messages.lt("created_at", state.before);
  const messageResult = messages ? await messages : { data: [] };
  const orderedMessages = [...(messageResult.data ?? [])].reverse();
  const existingChildren = new Set(threads.data?.map((thread) => thread.child_id));

  return <AppShell eyebrow={viewer.schoolName ?? "School"} title="Messages" nav={communicationNavigation(viewer.role!)}>
    <div className="messages-layout">
      <aside className="thread-list" aria-label="Conversations">
        <div className="section-heading"><h2>Conversations</h2></div>
        {threads.data?.map((thread) => {
          const unread = !readAt.get(thread.id) || thread.updated_at > readAt.get(thread.id)!;
          return <Link className={selected?.id === thread.id ? "thread-row selected" : "thread-row"} href={`/messages?thread=${thread.id}`} key={thread.id}>
            <span><strong>{thread.children?.preferred_name ?? "Child"}</strong><small>Guardian conversation</small></span>{unread ? <em>New</em> : null}
          </Link>;
        })}
        {!threads.data?.length ? <p className="empty-inline">No conversations are available.</p> : null}
        {viewer.role === "guardian" ? guardianLinks.data?.filter((link) => !existingChildren.has(link.child_id)).map((link) => <form action={startGuardianThreadAction} key={link.child_id}><input type="hidden" name="child_id" value={link.child_id} /><button className="button button-secondary">Start conversation about {link.children?.preferred_name ?? "child"}</button></form>) : null}
      </aside>
      <section className="section-panel message-panel">
        {selected ? <><div className="section-heading"><div><p className="eyebrow">Private conversation</p><h2>{selected.children?.preferred_name ?? "Child"}</h2></div></div>
          {messageResult.data?.length === 30 ? <Link className="text-link older-messages" href={`/messages?thread=${selected.id}&before=${encodeURIComponent(messageResult.data[messageResult.data.length - 1].created_at)}`}>Load older messages</Link> : null}
          <MessageThread threadId={selected.id} guardianMembershipId={selected.guardian_membership_id} viewerUserId={viewer.userId} initialMessages={orderedMessages} />
        </> : <div className="empty-state"><h2>Choose a conversation</h2><p>Messages are separated by child and guardian.</p></div>}
      </section>
    </div>
  </AppShell>;
}
