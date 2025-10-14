import type { MessageThread } from "@/features/messaging/types"

const now = new Date()

const minutesAgo = (mins: number) =>
  new Date(now.getTime() - mins * 60_000).toISOString()

export const messagingMockThreads: Record<"customer" | "driver" | "admin", MessageThread[]> = {
  customer: [
    {
      id: "thread-cust-1",
      title: "YVR drop-off Saturday 05:30",
      bookingId: "VA-48321",
      participants: ["customer", "admin", "driver"],
      lastUpdated: minutesAgo(12),
      status: "open",
      messages: [
        {
          id: "msg-1",
          author: "customer",
          body: "Hi! Can I add a second pickup at 05:10? It's my neighbour across the street.",
          timestamp: minutesAgo(42),
        },
        {
          id: "msg-2",
          author: "admin",
          body: "Absolutely. Updated the booking and fare. Driver will arrive 05:05 to accommodate.",
          timestamp: minutesAgo(30),
        },
        {
          id: "msg-3",
          author: "driver",
          body: "Noted. I'll text when I'm five minutes out.",
          timestamp: minutesAgo(12),
        },
      ],
    },
    {
      id: "thread-cust-2",
      title: "Return shuttle confirmed",
      bookingId: "VA-48321-R",
      participants: ["customer", "admin"],
      lastUpdated: minutesAgo(180),
      status: "resolved",
      messages: [
        {
          id: "msg-4",
          author: "admin",
          body: "Return from YVR for Sunday 22:10 is confirmed. Same driver as outbound.",
          timestamp: minutesAgo(200),
        },
        {
          id: "msg-5",
          author: "customer",
          body: "Perfect. Thanks for confirming!",
          timestamp: minutesAgo(180),
          read: true,
        },
      ],
    },
  ],
  driver: [
    {
      id: "thread-driver-1",
      title: "Runway construction detour",
      participants: ["driver", "admin", "system"],
      lastUpdated: minutesAgo(8),
      status: "open",
      messages: [
        {
          id: "msg-6",
          author: "system",
          body: "Heads up: Highway 1 eastbound reduced to single lane between 232 St and 264 St until 06:00.",
          timestamp: minutesAgo(25),
        },
        {
          id: "msg-7",
          author: "driver",
          body: "Copy. rerouting via Fraser Hwy for VA-78112 passengers.",
          timestamp: minutesAgo(12),
        },
        {
          id: "msg-8",
          author: "admin",
          body: "Thanks Matt. Log the detour on the trip before closeout.",
          timestamp: minutesAgo(8),
        },
      ],
    },
    {
      id: "thread-driver-2",
      title: "Vehicle 12 detailing",
      participants: ["driver", "admin"],
      lastUpdated: minutesAgo(320),
      status: "resolved",
      messages: [
        {
          id: "msg-9",
          author: "driver",
          body: "VAN-12 needs interior detailing after today's ski shuttle.",
          timestamp: minutesAgo(360),
        },
        {
          id: "msg-10",
          author: "admin",
          body: "Scheduled at depot tomorrow 14:00.",
          timestamp: minutesAgo(320),
        },
      ],
    },
  ],
  admin: [
    {
      id: "thread-admin-1",
      title: "Escalation: Flight delay AC 817",
      bookingId: "VA-48321",
      participants: ["admin", "customer", "driver"],
      lastUpdated: minutesAgo(4),
      status: "escalated",
      messages: [
        {
          id: "msg-11",
          author: "system",
          body: "Flight AC 817 ETA shifted to 07:40 (+45m).",
          timestamp: minutesAgo(28),
        },
        {
          id: "msg-12",
          author: "admin",
          body: "Rescheduling pickup to 06:35. Driver Matt, confirm availability?",
          timestamp: minutesAgo(20),
        },
        {
          id: "msg-13",
          author: "driver",
          body: "Confirmed. Will hold until new arrival time.",
          timestamp: minutesAgo(12),
        },
        {
          id: "msg-14",
          author: "customer",
          body: "Thank you! Updated in the app on my end.",
          timestamp: minutesAgo(4),
          read: true,
        },
      ],
    },
    {
      id: "thread-admin-2",
      title: "Corporate account onboarding: Horizon Labs",
      participants: ["admin", "system"],
      lastUpdated: minutesAgo(600),
      status: "open",
      messages: [
        {
          id: "msg-15",
          author: "system",
          body: "New corporate account submitted. Requires contract review and payment terms.",
          timestamp: minutesAgo(640),
        },
        {
          id: "msg-16",
          author: "admin",
          body: "Assigning to Sarah for follow-up.",
          timestamp: minutesAgo(600),
        },
      ],
    },
  ],
}
