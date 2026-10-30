import * as React from "react";
import { cn } from "@/lib/utils";

const field = "w-full rounded-md border border-input bg-card px-3 text-base placeholder:text-muted-foreground disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:bg-destructive/5 aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive";

export const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn(field, "h-11 pr-8", className)} {...p} />
));
Select.displayName = "Select";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(field, "min-h-[120px] py-2 leading-relaxed", className)} {...p} />
));
Textarea.displayName = "Textarea";

export function FieldError({ children, id }: { children?: React.ReactNode; id?: string }) {
  if (!children) return null;
  return <p id={id} role="alert" className="text-sm font-medium text-destructive">{children}</p>;
}
