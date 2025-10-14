export type MessageRole = "customer" | "driver" | "admin" | "guest" | "system"

export interface Message {
  id: string
  author: MessageRole
  body: string
  timestamp: string
  read?: boolean
}

export interface MessageThread {
  id: string
  title: string
  bookingId?: string
  participants: MessageRole[]
  lastUpdated: string
  status: "open" | "resolved" | "escalated"
  messages: Message[]
}
