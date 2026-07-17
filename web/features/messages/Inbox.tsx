"use client";

// Inbox: threads on the left, the selected conversation on the right.
//
// A thread exists per ORDER, so there is no compose screen and no recipient picker — you can only
// talk to someone you have actually done business with. That is a product decision as much as a
// simplification: it is what stops the messaging surface becoming a channel for unsolicited contact.
import { useCallback, useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { MessageThread } from "@/components/messages/MessageThread";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import type { ThreadSummary } from "@/app/api/messages/threads/route";

export function Inbox() {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch("/api/messages/threads");
      const json = await res.json();
      if (!res.ok) {
        setErr(json?.error?.message ?? "Couldn't load your messages.");
        return;
      }
      const list = json.threads as ThreadSummary[];
      setThreads(list);
      // Open the first thread on a wide screen so the panel isn't an empty box on arrival.
      setActive((cur) => cur ?? list[0]?.orderId ?? null);
    } catch {
      setErr("Network hiccup — retry.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (err && !threads) {
    return (
      <div className="card p-6 text-center">
        <p role="alert" className="text-sm text-asli-red">
          {err}
        </p>
        <button onClick={load} className="btn-ghost mt-3">
          Retry
        </button>
      </div>
    );
  }

  if (!threads) {
    return (
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]" aria-busy>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No conversations yet"
        hint="A thread opens with each buyer who orders from you — there's nobody to message before that."
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <ul className="card max-h-[32rem] divide-y divide-white/5 overflow-y-auto p-1">
        {threads.map((t) => {
          const selected = t.orderId === active;
          return (
            <li key={t.orderId}>
              <button
                onClick={() => {
                  setActive(t.orderId);
                  // Opening the thread marks it read server-side; drop the badge to match rather
                  // than leaving a count the user has visibly just cleared.
                  setThreads((list) =>
                    (list ?? []).map((x) => (x.orderId === t.orderId ? { ...x, unread: 0 } : x)),
                  );
                }}
                aria-current={selected ? "true" : undefined}
                className={`w-full rounded-lg px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet ${
                  selected ? "bg-asli-violet/15" : "hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white/80">
                    {t.listingTitle}
                  </p>
                  {t.unread > 0 && (
                    <span className="grid h-4 min-w-[1rem] place-items-center rounded-full bg-asli-pink px-1 text-[10px] font-bold text-white">
                      {t.unread}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-white/35">
                  {t.lastMessage ?? "No messages yet"}
                </p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-white/25">
                  order {t.orderStatus}
                </p>
              </button>
            </li>
          );
        })}
      </ul>

      {active ? (
        <MessageThread
          key={active}
          orderId={active}
          emptyHint="Nothing here yet. Say hello — the buyer sees this on their order page."
        />
      ) : (
        <div className="card grid place-items-center p-6 text-sm text-white/35">
          Pick a conversation.
        </div>
      )}
    </div>
  );
}
