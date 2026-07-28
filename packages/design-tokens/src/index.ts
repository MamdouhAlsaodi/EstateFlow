export const estateFlowTokens = {
  color: {
    canvas: "#f4f6f8",
    surface: "#ffffff",
    surfaceMuted: "#eaf0f5",
    ink: "#10233d",
    inkMuted: "#58708b",
    line: "#cfdae5",
    navy: "#123152",
    teal: "#007c83",
    gold: "#a96f16",
    success: "#197348",
    warning: "#9b6408",
    danger: "#b64040",
    focus: "#005fcc",
  },
  space: {
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.5rem",
    6: "2rem",
    7: "3rem",
  },
  radius: {
    small: "0.5rem",
    medium: "0.875rem",
    large: "1.25rem",
    pill: "999px",
  },
  font: {
    arabic: '"Noto Sans Arabic", "Tahoma", sans-serif',
    numeric: '"IBM Plex Mono", "SFMono-Regular", monospace',
  },
} as const;

export type EstateFlowTokens = typeof estateFlowTokens;
