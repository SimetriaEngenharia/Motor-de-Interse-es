import React from "react";
import { useStore } from "../store";
import { ProfileView } from "./ProfileView";

export function UnifiedProfileSuperView() {
  const { activeAlignmentId, alignments } = useStore();
  const alignment = alignments.find((a) => a.id === activeAlignmentId);
  const activeAlignmentName = alignment?.name || "Alinhamento";

  return (
    <div className="flex flex-col w-full h-full bg-[#0f172a] overflow-hidden">
      <div className="flex-1 relative">
        <ProfileView className="w-full h-full" hideHeader={false} />
      </div>
    </div>
  );
}
