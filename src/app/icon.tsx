import { ImageResponse } from 'next/og';
import fs from 'fs';
import path from 'path';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  const logoData = fs.readFileSync(path.join(process.cwd(), 'public', 'logo.png'));

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          overflow: 'hidden',
        }}
      >
        <img
          // @ts-ignore
          src={logoData.buffer}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    ),
    { ...size }
  );
}
