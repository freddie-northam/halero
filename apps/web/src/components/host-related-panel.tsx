// The host's adapter that lets any module surface an entity's
// relationships without depending on the host's link registry or router.
// A module is handed a `renderRelated(entityId)` slot that returns this;
// here we read the entity-kind map and the navigator from router context
// and hand them to the reusable RelatedPanel.

import { useRouter } from "@tanstack/react-router";
import type { ReactElement } from "react";
import type { RouterContext } from "../router";
import { RelatedPanel } from "./related-panel";

export interface HostRelatedPanelProps {
  readonly entityId: string;
}

export const HostRelatedPanel = ({
  entityId,
}: HostRelatedPanelProps): ReactElement => {
  const router = useRouter();
  const context = router.options.context as RouterContext;
  return (
    <RelatedPanel
      entityId={entityId}
      entityKinds={context.entityLinks}
      onNavigate={(link) => {
        void router.navigate({ to: link.path, search: link.search ?? {} });
      }}
    />
  );
};
