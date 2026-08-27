type Props = {
  name?: string | null;
  src?: string | null;
  className?: string;
};

export function initialsOf(name?: string | null) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Avatar amin'ny litera voalohany (JR ho an'i Jean Rolland). */
export default function InitialsAvatar({ name, src, className = "" }: Props) {
  if (src) {
    return <img src={src} alt={name ?? "avatar"} className={`object-cover ${className}`} />;
  }
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br from-[hsl(var(--gold-1)/0.35)] to-black/70 text-[hsl(var(--gold-1))] font-display font-bold tracking-wide ${className}`}
      aria-label={name ?? "avatar"}
    >
      {initialsOf(name)}
    </div>
  );
}
