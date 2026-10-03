import {
  Activity,
  Bike,
  BookOpen,
  Brain,
  Briefcase,
  CloudRain,
  Coffee,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  Heart,
  Leaf,
  type LucideIcon,
  MessageCircle,
  Moon,
  Music,
  Palette,
  PenLine,
  Pill,
  Salad,
  Smile,
  Sparkles,
  Sprout,
  Sun,
  Target,
  Trees,
  Volume2,
  VolumeX,
  Waves,
  Wind,
  Zap,
} from "lucide-react";

/** Curated icon set for habits (stored by name). */
export const HABIT_ICON_SET: Record<string, LucideIcon> = {
  target: Target,
  droplets: Droplets,
  footprints: Footprints,
  "book-open": BookOpen,
  brain: Brain,
  dumbbell: Dumbbell,
  salad: Salad,
  moon: Moon,
  "pen-line": PenLine,
  sprout: Sprout,
  music: Music,
  sparkles: Sparkles,
  pill: Pill,
  sun: Sun,
  smile: Smile,
  "message-circle": MessageCircle,
  palette: Palette,
  heart: Heart,
  coffee: Coffee,
  bike: Bike,
  activity: Activity,
  briefcase: Briefcase,
  leaf: Leaf,
  flame: Flame,
};

export const HABIT_ICON_NAMES = Object.keys(HABIT_ICON_SET);

/** Legacy emoji → icon name (data written before the icon set existed). */
const LEGACY: Record<string, string> = {
  "💧": "droplets",
  "🏃": "footprints",
  "📚": "book-open",
  "🧘": "brain",
  "💪": "dumbbell",
  "🥗": "salad",
  "😴": "moon",
  "✍️": "pen-line",
  "🎯": "target",
  "🌱": "sprout",
  "🎸": "music",
  "🧹": "sparkles",
  "💊": "pill",
  "🚶": "footprints",
  "🧠": "brain",
  "☀️": "sun",
  "🦷": "smile",
  "💬": "message-circle",
  "🎨": "palette",
  "🙏": "heart",
};

export function normalizeHabitIcon(icon: string | undefined | null): string {
  if (!icon) return "target";
  if (HABIT_ICON_SET[icon]) return icon;
  return LEGACY[icon] ?? "target";
}

export function HabitIcon({ name, size = 16, className, color }: { name: string; size?: number; className?: string; color?: string }) {
  const Icon = HABIT_ICON_SET[normalizeHabitIcon(name)] ?? Target;
  return <Icon size={size} className={className} color={color} />;
}

export const AMBIENT_ICON_SET: Record<string, LucideIcon> = {
  none: VolumeX,
  rain: CloudRain,
  brown: Waves,
  pink: Activity,
  white: Volume2,
  wind: Wind,
  stream: Trees,
  fire: Flame,
  cafe: Coffee,
};

export function AmbientIcon({ kind, size = 14, className }: { kind: string; size?: number; className?: string }) {
  const Icon = AMBIENT_ICON_SET[kind] ?? Zap;
  return <Icon size={size} className={className} />;
}

/** Two-bar pause glyph drawn with CSS, for tiny surfaces like the bubble. */
export function PauseBars({ size = 10, className }: { size?: number; className?: string }) {
  const w = Math.max(2, Math.round(size / 4));
  return (
    <span className={`inline-flex items-center gap-[2px] ${className ?? ""}`} style={{ height: size }} aria-hidden>
      <span className="h-full rounded-[1px] bg-current" style={{ width: w }} />
      <span className="h-full rounded-[1px] bg-current" style={{ width: w }} />
    </span>
  );
}
