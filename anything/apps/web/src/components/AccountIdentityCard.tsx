'use client';

/**
 * Account identity (display name + account photo) — the "Profile" card that
 * used to live on the Settings page, now shown on My Profile / Venue Profile
 * where the rest of the public identity is edited. Settings keeps it only
 * for roles without a profile page (party, admin).
 *
 * Saves through PUT /api/settings; the photo goes through the P4 upload
 * pipeline (see lib/upload-client.ts) instead of inlining raw base64 — the
 * root cause of the old "Failed to save settings" dead end — and every
 * failure surfaces the server's actual message.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Camera, Loader2, Save, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadImageFile, UploadError } from '@/lib/upload-client';

interface AccountIdentity {
  name: string;
  image: string;
}

export function AccountIdentityCard() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<AccountIdentity>({ name: '', image: '' });
  const [uploading, setUploading] = useState(false);

  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('Failed to load');
      return res.json() as Promise<{ settings: { name?: string; image?: string } }>;
    },
  });

  useEffect(() => {
    if (data?.settings) {
      setForm({ name: data.settings.name ?? '', image: data.settings.image ?? '' });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, image: form.image }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? 'Failed to save');
      return body;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Account identity saved!');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadImageFile(file, 'avatar');
      setForm((prev) => ({ ...prev, image: url }));
      toast.success('Photo ready — hit Save to keep it');
    } catch (error) {
      toast.error(error instanceof UploadError ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-[#1E1E1E] border border-white/5 rounded-2xl p-6">
      <div className="mb-5">
        <h2 className="text-base font-bold text-white">Account Identity</h2>
        <p className="text-xs text-white/40 mt-0.5">
          Your display name and photo across the platform
        </p>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-5">
        <div
          className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-white/10 bg-[#121212] flex items-center justify-center cursor-pointer group flex-shrink-0"
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = '';
            }}
          />
          {uploading ? (
            <Loader2 className="w-6 h-6 text-[#00FFCC] animate-spin" />
          ) : form.image ? (
            <>
              <img src={form.image} alt="Account photo" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-5 h-5 text-white" />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <User className="w-6 h-6 text-white/20" />
              <Camera className="w-3 h-3 text-white/20" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">
              Display Name
            </span>
            <input
              className="bg-[#121212] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-[#00FFCC] focus:ring-1 focus:ring-[#00FFCC] placeholder:text-white/35 transition-all w-full"
              placeholder="Your full name or stage name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </label>
          <p className="text-[11px] text-white/45 mt-1.5">PNG or JPG · Max 5MB</p>
        </div>
        <div className="flex-shrink-0 sm:self-end">
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || uploading || form.name.trim().length === 0}
            className="bg-[#00FFCC] text-black hover:bg-[#00FFCC]/90 font-bold gap-1.5"
            size="sm"
          >
            <Save className="w-3.5 h-3.5" />
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
