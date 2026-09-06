import { ImageResponse } from 'next/og';
import fs from 'fs';
import path from 'path';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  // Inlined as a data URI rather than handed over as a raw ArrayBuffer, which
  // is not an `img` src and needed a `@ts-ignore` to pass for one.
  const logo = fs
    .readFileSync(path.join(process.cwd(), 'public', 'logo.png'))
    .toString('base64');

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
        {/* eslint-disable-next-line @next/next/no-img-element --
            this renders through satori in an ImageResponse, not in the DOM,
            so next/image does not apply. */}
        <img
          alt=""
          src={`data:image/png;base64,${logo}`}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    ),
    { ...size }
  );
}
