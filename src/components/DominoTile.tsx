// Pi\u00e8ce de domino visuelle pour la r\u00e9utiliser partout
const Dot = ({ pos }: { pos: string }) => (
  <span className="absolute w-1.5 h-1.5 rounded-full bg-foreground" style={positions[pos]} />
);

const positions: Record<string, React.CSSProperties> = {
  c:  { top: "50%", left: "50%", transform: "translate(-50%,-50%)" },
  tl: { top: "20%", left: "20%" },
  tr: { top: "20%", right: "20%" },
  bl: { bottom: "20%", left: "20%" },
  br: { bottom: "20%", right: "20%" },
  ml: { top: "50%", left: "20%", transform: "translateY(-50%)" },
  mr: { top: "50%", right: "20%", transform: "translateY(-50%)" },
};
const layouts: Record<number, string[]> = {
  0: [], 1: ["c"], 2: ["tl","br"], 3: ["tl","c","br"],
  4: ["tl","tr","bl","br"], 5: ["tl","tr","c","bl","br"],
  6: ["tl","tr","ml","mr","bl","br"],
};

export function DominoFace({ value }: { value: number }) {
  return (
    <div className="relative flex-1 bg-[#f5f0e0] aspect-square">
      {layouts[value]?.map((p) => <Dot key={p} pos={p} />)}
    </div>
  );
}

export function DominoTile({ a, b, size = "md" }: { a: number; b: number; size?: "sm"|"md"|"lg" }) {
  const dim = size === "sm" ? "w-10 h-20" : size === "lg" ? "w-20 h-40" : "w-14 h-28";
  return (
    <div className={`${dim} rounded-md bg-[#f5f0e0] border border-foreground/20 flex flex-col overflow-hidden`} style={{ boxShadow: "0 4px 10px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.4)" }}>
      <DominoFace value={a} />
      <div className="h-px bg-foreground/30" />
      <DominoFace value={b} />
    </div>
  );
}
