'use client';

import { MessagesView } from '@/components/MessagesView';

/** PARTY messages (S19) — private-party inquiry threads via the shared view. */
export default function PartyMessagesPage() {
  return <MessagesView role="party" />;
}
