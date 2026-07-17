"use client";

// One order's conversation. Used by both sides — the seller's inbox and the buyer's order page —
// because a thread is the same object whichever end you hold it by. `skin` is the only difference:
// the seller portal is the dark Asli surface, the marketplace the bright Meesho one (§9).
import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Message } from "@/lib/db/types";

interface ThreadData {
  listingTitle: string;
  messages: Message[];
  me: string;
}

const SKIN = {
  dark: {
    wrap: "card p-4",
    title: "text-sm font-bold text-white/80",
    empty: "text-xs text-white/35",
    mine: "bg-asli-violet text-white",
    theirs: "bg-white/[0.06] text-white/80",
    stamp: "text-white/30",
    input:
      "min-h-[44px] flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-asli-violet",
    send: "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-asli-violet text-white transition hover:brightness-110 disabled:opacity-40",
    err: "text-asli-red",
  },
  light: {
    wrap: "buyer-card p-4",
    title: "text-sm font-bold text-zinc-800",
    empty: "text-xs text-zinc-400",
    mine: "bg-meesho-pink text-white",
    theirs: "bg-zinc-100 text-zinc-700",
    stamp: "text-zinc-400",
    input:
      "min-h-[44px] flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-meesho-pink",
    send: "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-meesho-pink text-white transition hover:brightness-110 disabled:opacity-40",
    err: "text-red-600",
  },
} as const;

export function MessageThread({
  orderId,
  skin = "dark",
  emptyHint,
}: {
  orderId: string;
  skin?: keyof typeof SKIN;
  emptyHint: string;
}) {
  const s = SKIN[skin];
  const [data, setData] = useState<ThreadData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch(`/api/messages?orderId=${encodeURIComponent(orderId)}`);
      const json = await res.json();
      if (!res.ok) {
        setErr(json?.error?.message ?? "Couldn't load this conversation.");
        return;
      }
      setData(json as ThreadData);
    } catch {
      setErr("Network hiccup — retry.");
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the newest message in view, the way every chat does.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [data?.messages.length]);

  async function send() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setErr(null);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, body: text }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(json?.error?.message ?? "Message not sent.");
        return;
      }
      // Append the server's row rather than an optimistic guess — its id and timestamp are the real
      // ones, so a later reload can't duplicate or reorder it.
      setData((d) => (d ? { ...d, messages: [...d.messages, json.message as Message] } : d));
      setBody("");
    } catch {
      setErr("Network hiccup — message not sent.");
    } finally {
      setSending(false);
    }
  }

  if (err && !data) {
    return (
      <div className={s.wrap}>
        <p role="alert" className={`text-sm ${s.err}`}>
          {err}
        </p>
        <button onClick={load} className="mt-2 text-sm underline">
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={s.wrap} aria-busy>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-12 w-3/4" />
        <Skeleton className="mt-2 h-12 w-2/3" />
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      <h2 className={s.title}>Messages</h2>

      <div className="my-3 max-h-80 space-y-2 overflow-y-auto pr-1">
        {data.messages.length === 0 ? (
          <p className={s.empty}>{emptyHint}</p>
        ) : (
          data.messages.map((m) => {
            const mine = m.fromUserId === data.me;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${mine ? s.mine : s.theirs}`}>
                  <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                  <p className={`mt-0.5 text-[10px] ${mine ? "text-white/60" : s.stamp}`}>
                    {new Date(m.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <div className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void send()}
          maxLength={2000}
          placeholder="Write a message…"
          aria-label="Message"
          className={s.input}
        />
        <button
          onClick={() => void send()}
          disabled={sending || !body.trim()}
          aria-label="Send message"
          className={s.send}
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {err && (
        <p role="alert" className={`mt-2 text-xs ${s.err}`}>
          {err}
        </p>
      )}
    </div>
  );
}
