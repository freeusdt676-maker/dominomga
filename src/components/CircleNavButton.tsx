import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: "default" | "primary" | "success" | "danger" | "warning" | "info";
  badge?: number | string | null;
  active?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
};

const variantClasses: Record<NonNullable<Props["variant"]>, string> = {
  default:
    "bg-gradient-to-br from-slate-700 to-slate-900 ring-slate-500/40 text-white",
  primary:
    "bg-gradient-to-br from-amber-500 to-yellow-700 ring-amber-300/50 text-white",
  success:
    "bg-gradient-to-br from-emerald-500 to-emerald-800 ring-emerald-300/50 text-white",
  danger:
    "bg-gradient-to-br from-red-500 to-red-800 ring-red-300/50 text-white",
  warning:
    "bg-gradient-to-br from-orange-500 to-orange-800 ring-orange-300/50 text-white",
  info:
    "bg-gradient-to-br from-sky-500 to-blue-800 ring-sky-300/50 text-white",
};

const sizeClasses: Record<NonNullable<Props["size"]>, { circle: string; icon: string; label: string }> = {
  sm: { circle: "w-12 h-12", icon: "[&>svg]:w-5 [&>svg]:h-5", label: "text-[10px]" },
  md: { circle: "w-14 h-14", icon: "[&>svg]:w-6 [&>svg]:h-6", label: "text-[11px]" },
  lg: { circle: "w-16 h-16", icon: "[&>svg]:w-7 [&>svg]:h-7", label: "text-xs" },
};

/**
 * Bouton boribory miaraka amin'ny logo eo anivony + soratra ambany.
 * Mampiasaina manerana ny app ho an'ny boutons navigation/action.
 */
export default function CircleNavButton({
  icon,
  label,
  onClick,
  href,
  variant = "default",
  badge,
  active,
  size = "md",
  className,
  disabled,
}: Props) {
  const sz = sizeClasses[size];
  const Inner = (
    <span className="flex flex-col items-center gap-1.5 group select-none">
      <span
        className={cn(
          "relative rounded-full flex items-center justify-center shadow-lg ring-2 transition-all",
          sz.circle,
          sz.icon,
          variantClasses[variant],
          active && "ring-4 scale-105",
          !disabled && "group-hover:scale-110 group-active:scale-95",
          disabled && "opacity-50 grayscale",
        )}
      >
        {icon}
        {badge != null && Number(badge) > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-background">
            {badge}
          </span>
        )}
      </span>
      <span className={cn("font-bold text-center leading-tight max-w-[68px] truncate", sz.label)}>
        {label}
      </span>
    </span>
  );

  if (href) {
    return (
      <a href={href} className={cn("inline-flex", className)}>
        {Inner}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn("inline-flex", className)}
    >
      {Inner}
    </button>
  );
}