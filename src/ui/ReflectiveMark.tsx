export function ReflectiveMark({ className = "" }: { className?: string }) {
  return (
    <p className={`text-meta text-muted ${className}`}>
      <a href="https://thereflectivefootball.com" target="_blank" rel="noreferrer">
        Part of The Reflective Football
      </a>
    </p>
  )
}
