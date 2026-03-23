"use client";

import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
} from "react";

import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-line/70 bg-card/90 p-6 shadow-halo backdrop-blur",
        className,
      )}
      {...props}
    />
  );
}

const buttonVariants = {
  primary:
    "bg-accent text-slate-950 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60",
  secondary:
    "bg-white/10 text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60",
  ghost:
    "bg-transparent text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60",
  danger:
    "bg-danger text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60",
};

type ButtonVariant = keyof typeof buttonVariants;

export function buttonStyles(variant: ButtonVariant = "primary", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition",
    buttonVariants[variant],
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonStyles(variant, className)}
      {...props}
    />
  );
});

export function Badge({
  className,
  tone = "muted",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "muted" | "success" | "danger" | "warning";
}) {
  const tones = {
    muted: "bg-white/8 text-white/75",
    success: "bg-success/15 text-success",
    danger: "bg-danger/15 text-danger",
    warning: "bg-warning/15 text-warning",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-2xl border border-line bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-[220px] w-full rounded-[24px] border border-line bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}

export function FieldLabel({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-white/55", className)}
      {...props}
    />
  );
}

export function ProgressBar({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const safeValue = Math.max(0, Math.min(value, 100));

  return (
    <div className={cn("h-2.5 w-full overflow-hidden rounded-full bg-white/10", className)}>
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500"
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}
