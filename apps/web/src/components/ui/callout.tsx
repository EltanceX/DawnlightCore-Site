import type { HTMLAttributes, ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/cn";

export function Callout({
  title,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { title: string; children: ReactNode }) {
  return (
    <div className={cn("dl-callout", className)} role="note" {...props}>
      <Info size={18} aria-hidden="true" />
      <div>
        <p className="dl-callout__title">{title}</p>
        <div className="dl-callout__body">{children}</div>
      </div>
    </div>
  );
}
