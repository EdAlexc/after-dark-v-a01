'use client';

import { MessagesView } from '@/components/MessagesView';

/** Venue messages (P5) — real threads via the shared two-pane view. */
export default function VenueMessagesPage() {
  return <MessagesView role="venue" />;
}
