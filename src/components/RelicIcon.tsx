import { useState } from 'react';

interface Props {
  name: string;
  size?: number;
  className?: string;
}

// Renders the actual wiki icon for a relic via the OSRS wiki's
// Special:FilePath redirect. Falls back to a glyph if the network image
// fails to load (offline, wiki rename, CORS, etc).
export function RelicIcon({ name, size = 28, className }: Props) {
  const [failed, setFailed] = useState(false);
  const cls = ['relic-icon', className].filter(Boolean).join(' ');
  if (failed) {
    return (
      <span
        className={`${cls} relic-icon-glyph`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}
        aria-hidden
      >
        ✦
      </span>
    );
  }
  const file = `${name} (Demonic Pacts League).png`;
  const src = `https://oldschool.runescape.wiki/w/Special:FilePath/${encodeURIComponent(file)}`;
  return (
    <img
      className={`${cls} relic-icon-img`}
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
