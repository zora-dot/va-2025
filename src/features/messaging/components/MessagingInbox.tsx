import { useMemo, useState } from "react"
import { messagingMockThreads } from "@/features/messaging/data/mockThreads"
import type { MessageThread, MessageRole } from "@/features/messaging/types"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { formatDistanceToNow } from "date-fns"
import { clsx } from "clsx"
import { Circle, MessageCircle, SendHorizonal } from "lucide-react"

type InboxRole = "customer" | "driver" | "admin"

interface MessagingInboxProps {
  role: InboxRole
}

const roleAccent: Record<MessageRole, string> = {
  admin: "text-aurora",
  driver: "text-glacier",
  customer: "text-ember",
  guest: "text-midnight/70",
  system: "text-horizon/70",
}

const roleLabel: Record<MessageRole, string> = {
  admin: "Dispatch",
  driver: "Driver",
  customer: "Customer",
  guest: "Guest",
  system: "System",
}

export const MessagingInbox = ({ role }: MessagingInboxProps) => {
  const threads = useMemo<MessageThread[]>(() => messagingMockThreads[role] ?? [], [role])
  const [activeThreadId, setActiveThreadId] = useState<string>(threads[0]?.id ?? "")

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? threads[0],
    [threads, activeThreadId],
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <GlassPanel className="p-0">
        <header className="flex items-center justify-between border-b border-horizon/15 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Inbox</p>
            <h3 className="font-heading text-lg uppercase tracking-[0.32em] text-horizon">
              {role === "admin" ? "Operations" : role === "driver" ? "Dispatch" : "Support"}
            </h3>
          </div>
          <MessageCircle className="h-5 w-5 text-horizon/60" />
        </header>
        <nav className="max-h-[420px] overflow-y-auto">
          {threads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => setActiveThreadId(thread.id)}
              className={clsx(
                "flex w-full flex-col gap-1 border-b border-horizon/10 px-4 py-3 text-left transition hover:bg-white/70",
                activeThread?.id === thread.id && "bg-white/90 shadow-inner",
              )}
            >
              <span className="text-sm font-semibold text-horizon line-clamp-1">{thread.title}</span>
              <span className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.32em] text-horizon/60">
                {thread.status}
                <Circle className="h-2 w-2 text-horizon/30" />
                {formatDistanceToNow(new Date(thread.lastUpdated), { addSuffix: true })}
              </span>
            </button>
          ))}
        </nav>
      </GlassPanel>
      {activeThread ? <ThreadDetail thread={activeThread} /> : <EmptyThread />}{" "}
    </div>
  )
}

const ThreadDetail = ({ thread }: { thread: MessageThread }) => {
  return (
    <GlassPanel className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-horizon/15 px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Thread</p>
          <h3 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">
            {thread.title}
          </h3>
        </div>
        {thread.bookingId ? (
          <span className="rounded-full border border-horizon/30 bg-white/70 px-3 py-1 text-[0.65rem] uppercase tracking-[0.3em] text-horizon/80">
            Booking {thread.bookingId}
          </span>
        ) : null}
      </header>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {thread.messages.map((message) => (
          <article
            key={message.id}
            className={clsx(
              "flex flex-col gap-1 rounded-2xl border border-horizon/15 bg-white/70 px-4 py-3 text-sm text-midnight/80 shadow-sm",
              message.author === "customer" && "border-ember/25 bg-ember/10",
              message.author === "driver" && "border-glacier/25 bg-glacier/10",
              message.author === "admin" && "border-aurora/25 bg-aurora/10",
              message.author === "system" && "border-horizon/20 bg-white/70 italic",
            )}
          >
            <header className="flex items-center justify-between text-[0.7rem] uppercase tracking-[0.3em]">
              <span className={clsx("font-semibold", roleAccent[message.author])}>
                {roleLabel[message.author]}
              </span>
              <time className="text-horizon/60">
                {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
              </time>
            </header>
            <p className="leading-relaxed text-midnight/80">{message.body}</p>
          </article>
        ))}
      </div>
      <footer className="border-t border-horizon/15 px-5 py-4">
        <div className="flex items-center gap-3">
          <input
            disabled
            placeholder="Compose message…"
            className="flex-1 rounded-full border border-dashed border-horizon/30 bg-white/60 px-4 py-3 text-sm text-horizon/60 outline-none disabled:cursor-not-allowed"
          />
          <button
            disabled
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-horizon/30 bg-white/60 text-horizon/40"
          >
            <SendHorizonal className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-[0.65rem] uppercase tracking-[0.3em] text-horizon/40">
          Real-time messaging syncs once Firebase is connected.
        </p>
      </footer>
    </GlassPanel>
  )
}

const EmptyThread = () => (
  <GlassPanel className="flex h-full items-center justify-center p-8 text-center text-sm text-midnight/60">
    <div>
      <p className="font-heading text-lg uppercase tracking-[0.32em] text-horizon/70">
        No conversation selected
      </p>
      <p className="mt-3 text-sm text-midnight/70">
        Pick a conversation from the inbox to view full details. Messaging goes live once Firebase
        Firestore is connected.
      </p>
    </div>
  </GlassPanel>
)
