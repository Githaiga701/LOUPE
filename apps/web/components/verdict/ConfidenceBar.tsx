import { BAND } from "@/lib/aggregate";

/**
 * Segmented bar of 20 squares filled to the calibrated value, with the
 * inconclusive band visibly marked. The number is always printed too.
 */
export function ConfidenceBar({ value, color }: { value: number; color: "authentic" | "uncertain" | "manipulated" }) {
  const filled = Math.round(value * 20);
  const bandStart = Math.round(BAND[0] * 20);
  const bandEnd = Math.round(BAND[1] * 20);
  const fill = { authentic: "bg-authentic", uncertain: "bg-uncertain", manipulated: "bg-manipulated" }[color];
  return (
    <div className="flex items-center gap-4">
      <div className="flex gap-[3px]" role="img" aria-label={`Confidence ${Math.round(value * 100)} percent. Inconclusive band from ${BAND[0] * 100} to ${BAND[1] * 100} percent.`}>
        {Array.from({ length: 20 }, (_, i) => {
          const inBand = i >= bandStart && i < bandEnd;
          return (
            <span
              key={i}
              className={[
                "block w-3 h-5 border",
                i < filled ? `${fill} border-transparent` : "bg-frame-dim border-rule",
                inBand ? "outline-1 outline-dashed outline-ink-soft -outline-offset-1" : "",
              ].join(" ")}
            />
          );
        })}
      </div>
      <span className="tabular-nums text-[20px] font-semibold">{Math.round(value * 100)}%</span>
      <span className="text-[13px] text-ink-soft">confidence</span>
    </div>
  );
}
