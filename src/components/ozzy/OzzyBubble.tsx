"use client";

const MAX = 70;

export function OzzyBubble({ line }: { line?: string }) {
  const text = line && line.length > MAX ? `${line.slice(0, MAX - 1)}…` : line;
  return (
    <div role="status" aria-live="polite" className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2">
      {text ? (
        <p className="w-max max-w-[16rem] rounded-lg border-2 border-[#1a0f3a] bg-[#fff1d6] px-2.5 py-1 text-center text-xs font-semibold leading-snug text-[#2a1a6e] shadow-[0_3px_0_#1a0f3a]">
          {text}
        </p>
      ) : null}
    </div>
  );
}
