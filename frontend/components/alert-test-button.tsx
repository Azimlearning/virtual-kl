"use client"

import { useTransition } from "react"
import { Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { sendTestAlert } from "@/app/actions/crisis"
import type { AlertChannel } from "@/lib/api"

const WHERE: Record<AlertChannel, string> = {
  telegram: "Check your Telegram chat.",
  email: "Check your inbox (and spam folder) for a message titled [CISE] Test message.",
}

export function AlertTestButton({ channel, disabled }: { channel: AlertChannel; disabled: boolean }) {
  const [isPending, startTransition] = useTransition()

  function send() {
    startTransition(async () => {
      try {
        await sendTestAlert(channel)
        toast.success("Test message sent", { description: WHERE[channel] })
      } catch (err) {
        toast.error("Test message failed", { description: (err as Error).message })
      }
    })
  }

  return (
    <Button variant="secondary" size="sm" className="gap-1.5" disabled={disabled || isPending} onClick={send}>
      <Send className="h-4 w-4" />
      {isPending ? "Sending…" : "Send test message"}
    </Button>
  )
}
