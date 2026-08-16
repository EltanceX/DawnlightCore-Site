import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function PageContainer({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("dl-page-container", className)} {...props} />;
}
