import type { ButtonHTMLAttributes, ReactElement } from "react";

export type ButtonVariant = "default" | "primary" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
}

const BASE_CLASSES =
  "inline-flex items-center justify-center gap-1.5 rounded-control font-medium " +
  "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-focus-ring disabled:pointer-events-none disabled:opacity-50";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default: "border border-border bg-surface text-text hover:bg-stone-100",
  primary:
    "border border-transparent bg-accent text-accent-fg hover:bg-indigo-700",
  danger: "border border-transparent bg-red-600 text-white hover:bg-red-700",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-8 px-3 text-sm",
};

export const Button = ({
  variant = "default",
  size = "md",
  type = "button",
  className = "",
  ...rest
}: ButtonProps): ReactElement => (
  <button
    type={type}
    className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`.trim()}
    {...rest}
  />
);
