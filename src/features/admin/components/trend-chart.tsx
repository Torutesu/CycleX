type Series = {
  key: string;
  label: string;
  color: string;
  values: number[];
};

type Props = {
  labels: string[];
  series: Series[];
};

const WIDTH = 720;
const HEIGHT = 200;
const PADDING = { top: 12, right: 12, bottom: 22, left: 32 };

/**
 * 直近30日の推移(AD-01)。
 * 依存を増やさないため、インライン SVG の折れ線グラフで描画する。
 */
export function TrendChart({ labels, series }: Props) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const stepX = labels.length > 1 ? innerWidth / (labels.length - 1) : 0;

  const x = (index: number) => PADDING.left + index * stepX;
  const y = (value: number) => PADDING.top + innerHeight - (value / max) * innerHeight;

  // Y 軸の目盛りは 0・中間・最大の3本に抑える
  const ticks = [0, Math.round(max / 2), max].filter(
    (value, index, list) => list.indexOf(value) === index,
  );

  return (
    <figure className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-52 w-full min-w-[640px]"
        role="img"
        aria-label={`直近${labels.length}日の推移`}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={PADDING.left - 6}
              y={y(tick) + 3}
              textAnchor="end"
              className="fill-muted-foreground text-[9px] tabular-nums"
            >
              {tick}
            </text>
          </g>
        ))}

        {series.map((s) => (
          <polyline
            key={s.key}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={s.values.map((value, index) => `${x(index)},${y(value)}`).join(" ")}
          />
        ))}

        {/* 端の日付だけラベルにする(30 本すべてでは読めないため) */}
        <text
          x={PADDING.left}
          y={HEIGHT - 6}
          className="fill-muted-foreground text-[9px] tabular-nums"
        >
          {labels[0]?.slice(5)}
        </text>
        <text
          x={WIDTH - PADDING.right}
          y={HEIGHT - 6}
          textAnchor="end"
          className="fill-muted-foreground text-[9px] tabular-nums"
        >
          {labels[labels.length - 1]?.slice(5)}
        </text>
      </svg>

      <figcaption className="mt-2 flex flex-wrap gap-4 text-xs">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: s.color }}
              aria-hidden
            />
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
