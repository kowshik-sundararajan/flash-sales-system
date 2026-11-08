import type { Message, Tone } from "../lib/messages";
import { Icon, type IconName } from "./Icon";

const ICONS: Record<Tone, IconName> = {
  success: "check",
  info: "info",
  warning: "alert",
  danger: "alert",
  neutral: "info",
};

export function Banner({ message }: { message: Message }) {
  return (
    <div className={`banner tone-${message.tone}`}>
      <Icon name={ICONS[message.tone]} />
      <span>{message.text}</span>
    </div>
  );
}
