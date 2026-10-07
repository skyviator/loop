import Link from "next/link";
import { notFound } from "next/navigation";

import { startGuardianThreadAction } from "@/app/actions/communication";
import { AppShell, StatusNote } from "@/components/app-shell";
import { MessageThread } from "@/components/message-thread";
import { requireViewer } from "@/lib/auth";
import { communicationNavigation } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import { schoolDateTimeLabel } from "@/lib/timezone";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ thread?: string; before?: string }> }) {
  const viewer = await requireViewer(["school_admin", "teacher", "guardian"]);
  const state = await searchParams;
  const supabase = await createClient();
  const feature = await supabase.from("school_feature_settings").select("is_enabled").eq("school_id", viewer.schoolId!).eq("feature_key", "messaging").maybeSingle();
  if (!feature.data?.is_enabled) return <AppShell eyebrow={viewer.schoolName ?? "School"} title="Messages" nav={communicationNavigation(viewer.role!)} contentWidth="wide"><StatusNote tone="warning">Messaging is not enabled for this school.</StatusNote></AppShell>;

  const requestedThread = typeof state.thread === "string" ? state.thread : null;
  const requestedThreadId = requestedThread && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedThread) ? requestedThread : null;
  let requestedMessages = requestedThreadId ? supabase.from("messages").select("id, body, created_at, sender_user_id, sender_membership_id").eq("thread_id", requestedThreadId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(30) : null;
  if (requestedMessages && state.before) requestedMessages = requestedMessages.lt("created_at", state.before);
  const [threads, reads, guardianLinks, requestedMessageResult] = await Promise.all([
    supabase.rpc("list_accessible_message_thread_summaries"),
    supabase.from("message_thread_reads").select("thread_id, last_read_at").eq("membership_id", viewer.membershipId!),
    viewer.role === "guardian" ? supabase.from("child_guardians").select("child_id, children(preferred_name)").eq("guardian_membership_id", viewer.membershipId!).eq("status", "active") : Promise.resolve({ data: [] }),
    requestedMessages ?? Promise.resolve({ data: [] }),
  ]);
  const readAt = new Map(reads.data?.map((item) => [item.thread_id, item.last_read_at]));
  if (requestedThread && (!requestedThreadId || !threads.data?.some((thread) => thread.id === requestedThreadId))) notFound();
  const selected = requestedThreadId ? threads.data?.find((thread) => thread.id === requestedThreadId) : threads.data?.[0];
  let messageResult = requestedThreadId && selected?.id === requestedThreadId ? requestedMessageResult : { data: [] as typeof requestedMessageResult.data };
  if (selected && selected.id !== requestedThreadId) {
    let messages = supabase.from("messages").select("id, body, created_at, sender_user_id, sender_membership_id").eq("thread_id", selected.id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(30);
    if (state.before) messages = messages.lt("created_at", state.before);
    messageResult = await messages;
  }
  const orderedMessages = [...(messageResult.data ?? [])].reverse().map((message) => ({
    ...message,
    created_at_label: schoolDateTimeLabel(new Date(message.created_at), viewer.timezone),
  }));
  const existingChildren = new Set(threads.data?.map((thread) => thread.child_id));

  return <AppShell eyebrow={viewer.schoolName ?? "School"} title="Messages" nav={communicationNavigation(viewer.role!)} contentWidth="wide">
    <div className="messages-layout">
      <aside className="thread-list" aria-label="Conversations">
        <div className="section-heading"><h2>Conversations</h2></div>
        {threads.data?.map((thread) => {
          const unread = !readAt.get(thread.id) || thread.updated_at > readAt.get(thread.id)!;
          return <Link className={selected?.id === thread.id ? "thread-row selected" : "thread-row"} href={`/messages?thread=${thread.id}`} key={thread.id}>
            <span><strong>{thread.child_name}</strong><small>{viewer.role === "guardian" ? "School conversation" : `${thread.guardian_name} · ${thread.relationship_label}`}</small></span>{unread ? <em>New</em> : null}
          </Link>;
        })}
        {!threads.data?.length ? <p className="empty-inline">No conversations are available.</p> : null}
        {viewer.role === "guardian" ? guardianLinks.data?.filter((link) => !existingChildren.has(link.child_id)).map((link) => <form action={startGuardianThreadAction} key={link.child_id}><input type="hidden" name="child_id" value={link.child_id} /><button className="button button-secondary">Start conversation about {link.children?.preferred_name ?? "child"}</button></form>) : null}
      </aside>
      <section className="section-panel message-panel">
        {selected ? <><div className="section-heading"><div><p className="eyebrow">Private conversation</p><h2>{selected.child_name}</h2>{viewer.role !== "guardian" ? <p className="muted">{selected.guardian_name} · {selected.relationship_label}</p> : null}</div></div>
          {messageResult.data?.length === 30 ? <Link className="text-link older-messages" href={`/messages?thread=${selected.id}&before=${encodeURIComponent(messageResult.data[messageResult.data.length - 1].created_at)}`}>Load older messages</Link> : null}
          <MessageThread key={selected.id} threadId={selected.id} guardianMembershipId={selected.guardian_membership_id} viewerUserId={viewer.userId} schoolTimezone={viewer.timezone} initialMessages={orderedMessages} />
        </> : <div className="empty-state"><h2>Choose a conversation</h2><p>Messages are separated by child and guardian.</p></div>}
      </section>
    </div>
  </AppShell>;
}
