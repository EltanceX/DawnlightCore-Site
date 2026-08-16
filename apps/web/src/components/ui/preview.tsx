import { Check, Download, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { IconButton } from "@/components/ui/icon-button";

/** Small fixture used by future visual/component checks. */
export function UiPreview() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Badge>Preview</Badge>
      <Button>
        <Download size={16} aria-hidden="true" />
        下载
      </Button>
      <Button variant="secondary">次要操作</Button>
      <IconButton label="确认">
        <Check size={16} aria-hidden="true" />
      </IconButton>
      <Callout title="当前为预览合同">
        <Info size={14} className="mr-1 inline" aria-hidden="true" />
        内容可能随 Core contract 更新。
      </Callout>
    </div>
  );
}
