"use client";

import { useActionState, useEffect, useState } from "react";

import { sendMessageAction, markThreadReadAction } from "@/app/actions/communication";
import type { ActionState } from "@/app/actions/core";
import { createClient } from "@/lib/supabase/client";

type Message = { id: string; body: string; created_at: string; sender_user_id: string; sender_membership_id: string };
const initialState: ActionState = { status: "idle", message: "" };

export function MessageThread({ threadId, guardianMembershipId, viewerUserId, initialMessages }: { threadId: string; guardianMembershipId: string; viewerUserId: string; initialMessages: Message[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [state, action, pending] = useActionState(sendMessageAction, initialState);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "ready" | "error">("connecting");

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled || !data.session?.access_token) {
        setRealtimeStatus("error");
        return;
      }
      await supabase.realtime.setAuth(data.session.access_token);
      const refreshMessages = async () => {
        const result = await supabase
          .from("messages")
          .select("id, body, created_at, sender_user_id, sender_membership_id")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(30);
        if (cancelled) return;
        if (result.error) {
          setMessages([]);
          setRealtimeStatus("error");
          return;
        }
        setMessages([...(result.data ?? [])].reverse());
        void markThreadReadAction(threadId);
      };
      channel = supabase.channel(`message-thread:${threadId}`, { config: { private: true } })
        .on("broadcast", { event: "message_changed" }, () => {
          void refreshMessages();
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") setRealtimeStatus("ready");
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setRealtimeStatus("error");
        });
    });
    void markThreadReadAction(threadId);
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [threadId]);

  return <div className="message-workspace">
    <div className="message-list" aria-live="polite">
      {messages.map((message) => <article className={message.sender_user_id === viewerUserId ? "message message-own" : "message"} key={message.id}>
        <span>{message.sender_membership_id === guardianMembershipId ? "Family" : "School"}</span>
        <p>{message.body}</p>
        <time>{new Date(message.created_at).toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" })}</time>
      </article>)}
      {!messages.length ? <p className="empty-inline">No messages yet. This conversation is private to this guardian and the child’s assigned school staff.</p> : null}
    </div>
    <p className="meta" data-realtime-status={realtimeStatus}>{realtimeStatus === "connecting" ? "Connecting live updates…" : realtimeStatus === "error" ? "Live updates are unavailable. Refresh to see new messages." : "Live updates connected"}</p>
    <form action={action} className="message-composer">
      <input type="hidden" name="thread_id" value={threadId} />
      <label className="field"><span>Message</span><textarea name="body" maxLength={2000} rows={3} required /></label>
      <div className="form-footer">{state.status !== "idle" ? <p className={`form-result status-${state.status}`} role="status">{state.message}</p> : <span />}<button className="button button-primary" disabled={pending}>{pending ? "Sending…" : "Send message"}</button></div>
    </form>
  </div>;
}
