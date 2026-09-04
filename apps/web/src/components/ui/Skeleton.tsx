interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

const HAS_ROUNDED = /(?:^|\s)rounded(?:-\S+)?(?:\s|$)/

export function Skeleton({ className, ...props }: SkeletonProps) {
  const rounded = className && HAS_ROUNDED.test(className) ? "" : "rounded-md"
  return (
    <div
      className={`animate-pulse ${rounded} bg-fill ${className || ""}`}
      {...props}
    />
  )
}
