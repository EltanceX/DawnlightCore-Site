import { SunMedium } from "lucide-react";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="dl-brand" aria-label="DawnlightCore">
      <span className="dl-brand__mark" aria-hidden="true">
        <SunMedium size={compact ? 15 : 17} strokeWidth={2.2} />
      </span>
      {!compact && <span className="dl-brand__name">DawnlightCore</span>}
    </span>
  );
}
