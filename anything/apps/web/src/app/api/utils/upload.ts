interface UploadInput {
  url?: string;
  buffer?: Buffer;
  base64?: string;
}

interface UploadResult {
  url: string;
  mimeType: string | null;
}

const CREATE_BASE_URL =
  process.env.NEXT_PUBLIC_CREATE_BASE_URL ?? 'https://www.create.xyz';

async function upload({ url, buffer, base64 }: UploadInput): Promise<UploadResult> {
  const response = await fetch(`${CREATE_BASE_URL}/api/v0/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': buffer ? 'application/octet-stream' : 'application/json',
    },
    body: buffer ? new Uint8Array(buffer) : JSON.stringify({ base64, url }),
  });
  const data = await response.json();
  return {
    url: data.url,
    mimeType: data.mimeType || null,
  };
}

export { upload };
export default upload;
