"use client";

import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  forwardRef,
} from "react";

import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "motion-fade-up rounded-[28px] border border-line/70 bg-card/90 p-6 shadow-halo backdrop-blur transition-[border-color,background-color,box-shadow,transform] duration-300",
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
      className={cn(
        "mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-white/55",
        className,
      )}
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

export function Tooltip({
  content,
  children,
  className,
}: {
  content: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("group relative inline-flex min-w-0 max-w-full", className)} title={content}>
      {children}
      <span className="pointer-events-none absolute left-0 top-[calc(100%+0.5rem)] z-20 hidden max-w-[320px] rounded-2xl border border-line bg-slate-950/95 px-3 py-2 text-xs leading-5 text-white shadow-2xl group-hover:block">
        {content}
      </span>
    </span>
  );
}

export function TruncatedText({
  text,
  lines = 1,
  className,
}: {
  text: string;
  lines?: 1 | 2 | 3;
  className?: string;
}) {
  const lineClass =
    lines === 1 ? "truncate" : lines === 2 ? "line-clamp-2" : "line-clamp-3";

  return (
    <Tooltip content={text}>
      <span className={cn("block min-w-0 max-w-full", lineClass, className)}>{text}</span>
    </Tooltip>
  );
}

export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton rounded-2xl", className)} {...props} />;
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={`line-${index}`}
          className={cn(
            "h-3",
            index === lines - 1 ? "w-2/3" : "w-full",
          )}
        />
      ))}
    </div>
  );
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
      <div
        className="absolute inset-0"
        onClick={onClose}
        role="button"
        tabIndex={-1}
        aria-label="Close modal overlay"
      />
      <div className="motion-soft-pop relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[32px] border border-line bg-slate-950 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-line/70 px-6 py-5">
          <div>
            <p className="font-display text-3xl text-white">{title}</p>
            {description ? (
              <p className="mt-2 text-sm leading-6 text-white/60">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line bg-white/[0.04] p-2 text-white/70 transition hover:bg-white/[0.08] hover:text-white"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{children}</div>
        {footer ? (
          <div className="border-t border-line/70 px-6 py-5">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/65 backdrop-blur-sm">
      <div
        className="absolute inset-0"
        onClick={onClose}
        role="button"
        tabIndex={-1}
        aria-label="Close drawer overlay"
      />
      <div className="motion-soft-pop absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-line bg-slate-950 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-line/70 px-6 py-5">
          <div>
            <p className="font-display text-3xl text-white">{title}</p>
            {description ? (
              <p className="mt-2 text-sm leading-6 text-white/60">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line bg-white/[0.04] p-2 text-white/70 transition hover:bg-white/[0.08] hover:text-white"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{children}</div>
        {footer ? (
          <div className="border-t border-line/70 px-6 py-5">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

export function TabsBar({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string; icon?: ReactNode }[];
  value: string;
  onChange: (nextValue: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 rounded-[24px] border border-line bg-white/[0.03] p-2">
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition",
              active
                ? "bg-white text-slate-950"
                : "bg-transparent text-white/65 hover:bg-white/[0.08] hover:text-white",
            )}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
