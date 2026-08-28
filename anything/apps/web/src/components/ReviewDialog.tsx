'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * S8 review composer — shift-scoped, one review per direction. The server
 * derives who is being reviewed from the caller's side of the shift; this
 * dialog only collects stars + an optional comment (rendered elsewhere as
 * plain text — never HTML).
 */
export default function ReviewDialog({
  shiftId,
  counterpartLabel,
  trigger,
}: {
  shiftId: string;
  /** e.g. the venue name or talent stage name being reviewed. */
  counterpartLabel: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const qc = useQueryClient();

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_id: shiftId, rating, comment }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not submit review');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Review posted — thanks for keeping the scene honest');
      setOpen(false);
      setRating(0);
      setComment('');
      void qc.invalidateQueries({ queryKey: ['talent-shifts'] });
      void qc.invalidateQueries({ queryKey: ['venue-shifts'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="bg-[#1E1E1E] border-white/10 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-black">
            Rate {counterpartLabel}
          </DialogTitle>
          <DialogDescription className="text-xs text-white/40">
            Reviews are public and tied to this completed shift — one per side.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-center gap-2 py-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                onMouseEnter={() => setHovered(value)}
                onMouseLeave={() => setHovered(0)}
                aria-label={`${value} star${value > 1 ? 's' : ''}`}
                className="transition-transform hover:scale-110"
              >
                <Star
                  className={cn(
                    'w-8 h-8 transition-colors',
                    value <= (hovered || rating)
                      ? 'text-yellow-400 fill-yellow-400'
                      : 'text-white/15'
                  )}
                />
              </button>
            ))}
          </div>

          <textarea
            rows={3}
            maxLength={1000}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="How did it go? (optional)"
            className="w-full bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-[#00FFCC]/40 transition-colors resize-none"
          />

          <Button
            onClick={() => submit.mutate()}
            disabled={rating === 0 || submit.isPending}
            className="w-full bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-black disabled:opacity-40"
          >
            {submit.isPending ? 'Posting…' : 'Post Review'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
