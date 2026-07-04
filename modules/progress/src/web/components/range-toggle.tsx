import { Tabs, TabsList, TabsTrigger } from "@halero/ui";
import type { ReactElement } from "react";
import type { HeatmapRange } from "../../contract";

export interface RangeToggleProps {
  readonly range: HeatmapRange;
  readonly onRangeChange: (range: HeatmapRange) => void;
}

const isRange = (value: string): value is HeatmapRange =>
  value === "year" || value === "6months" || value === "month";

/** The Year / 6 months / This month toggle, driven by local page state. */
export const RangeToggle = ({
  range,
  onRangeChange,
}: RangeToggleProps): ReactElement => (
  <Tabs
    value={range}
    onValueChange={(value) => {
      if (isRange(value)) {
        onRangeChange(value);
      }
    }}
  >
    <TabsList aria-label="Heatmap range">
      <TabsTrigger value="year">Year</TabsTrigger>
      <TabsTrigger value="6months">6 months</TabsTrigger>
      <TabsTrigger value="month">This month</TabsTrigger>
    </TabsList>
  </Tabs>
);
