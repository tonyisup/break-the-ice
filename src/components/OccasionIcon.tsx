import {
  Car,
  Dices,
  Heart,
  Home,
  MessageCircle,
  Sparkles,
  Users,
  Utensils,
  type LucideProps,
} from "lucide-react";
import type { OccasionIconName } from "@/config/occasions";

const ICON_MAP: Record<OccasionIconName, React.ComponentType<LucideProps>> = {
  sparkles: Sparkles,
  utensils: Utensils,
  car: Car,
  heart: Heart,
  home: Home,
  dice: Dices,
  "message-circle": MessageCircle,
  users: Users,
};

export function OccasionIcon({
  name,
  ...props
}: { name: OccasionIconName } & LucideProps) {
  const Component = ICON_MAP[name] ?? Sparkles;
  return <Component {...props} />;
}
