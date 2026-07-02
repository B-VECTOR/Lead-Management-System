export function ProgressRing({ value = 0, size = 40, strokeWidth = 4 }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference
  const color = value >= 100 ? 'stroke-emerald-500' : value > 0 ? 'stroke-blue-500' : 'stroke-neutral-300'

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} className="fill-none stroke-neutral-200 dark:stroke-neutral-800" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth}
          className={`fill-none ${color} transition-all duration-300`}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-[10px] font-semibold text-foreground">{value}%</span>
    </div>
  )
}
