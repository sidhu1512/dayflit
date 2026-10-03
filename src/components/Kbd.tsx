export function Kbd({ children }: { children: string }) {
  const parts = children.split("+");
  return (
    <span className="inline-flex items-center gap-0.5">
      {parts.map((p, i) => (
        <kbd key={i}>{p.trim()}</kbd>
      ))}
    </span>
  );
}
