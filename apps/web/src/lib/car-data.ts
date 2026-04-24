/*
 * Israeli market makes / models — curated starter list.
 * Comboboxes enforce selection from this list; freeform model names
 * that come back from the gov plate lookup or AI image recognition
 * are reconciled via fuzzy match on the client (case-insensitive,
 * trimmed, diacritics-insensitive for Hebrew).
 *
 * Additions welcome as we encounter real dealer inventory.
 */

export const CAR_MAKES_MODELS: Record<string, string[]> = {
  טויוטה: ["קורולה", "קאמרי", "RAV4", "יאריס", "C-HR", "לנד קרוזר", "פריוס", "אוריס", "אוונסיס"],
  מזדה: ["מזדה 3", "מזדה 6", "CX-5", "CX-3", "CX-30", "MX-5", "מזדה 2"],
  יונדאי: ["i10", "i20", "i30", "i35", "טוסון", "סנטה פה", "איוניק 5", "איוניק 6", "קונה"],
  קיה: ["ריו", "סיד", "ספורטג'", "סורנטו", "סטוניק", "EV6", "ניירו", "פיקנטו"],
  סקודה: ["פביה", "אוקטביה", "סופרב", "קודיאק", "קארוק", "קאמיק"],
  פולקסווגן: ["גולף", "פולו", "פאסאט", "טיגואן", "T-Cross", "ID.3", "ID.4"],
  "פיג'ו": ["208", "308", "408", "2008", "3008", "5008"],
  סיטרואן: ["C3", "C4", "C5 X", "C3 איירקרוס", "C5 איירקרוס"],
  סאב: ["9-3", "9-5"],
  מיצובישי: ["לנסר", "ASX", "אאוטלנדר", "אקליפס קרוס", "L200"],
  סוזוקי: ["סוויפט", "ויטרה", "ג'ימני", "איגניס", "בלנו"],
  ניסן: ["מיקרה", "ג'וק", "קשקאי", "X-Trail", "לף"],
  הונדה: ["ג'אז", "סיויק", "HR-V", "CR-V", "e"],
  מיני: ["קופר", "קאנטרימן", "קלאבמן", "פייסמן"],
  BMW: ["סדרה 1", "סדרה 2", "סדרה 3", "סדרה 4", "סדרה 5", "X1", "X3", "X5"],
  מרצדס: ["A", "B", "C", "E", "S", "GLA", "GLB", "GLC", "GLE"],
  אאודי: ["A1", "A3", "A4", "A6", "Q2", "Q3", "Q5", "Q7"],
  וולבו: ["S60", "S90", "V60", "V90", "XC40", "XC60", "XC90"],
  לקסוס: ["CT", "IS", "ES", "NX", "RX", "UX"],
  "אלפא רומיאו": ["ג'וליאטה", "ג'וליה", "סטלביו", "טונאל"],
  MG: ["3", "5", "ZS", "HS"],
  "ג'יפ": ["רנגייד", "קומפס", "צ'רוקי", "גרנד צ'רוקי", "רנגלר"],
  "לנד רובר": ["דיסקברי ספורט", "דיסקברי", "רנג' רובר ספורט", "רנג' רובר"],
  פורשה: ["קאיין", "מקאן", "פנמרה", "911", "טאיקאן"],
};

export const CAR_MAKES = Object.keys(CAR_MAKES_MODELS).sort();

export function getModelsForMake(make: string): string[] {
  return CAR_MAKES_MODELS[make] ?? [];
}

/**
 * Fuzzy-match a free-form make/model string (from plate lookup or AI)
 * against the curated list. Returns the canonical value if found,
 * otherwise the original string so the user can at least see it.
 */
export function matchMake(input: string | null | undefined): string | null {
  if (!input) return null;
  const needle = input.trim().toLowerCase();
  if (!needle) return null;
  for (const make of CAR_MAKES) {
    if (make.toLowerCase() === needle) return make;
  }
  // Partial match — pick the first make whose name contains the needle
  for (const make of CAR_MAKES) {
    if (make.toLowerCase().includes(needle) || needle.includes(make.toLowerCase())) {
      return make;
    }
  }
  return null;
}

export function matchModel(make: string | null, input: string | null | undefined): string | null {
  if (!make || !input) return null;
  const models = getModelsForMake(make);
  const needle = input.trim().toLowerCase();
  if (!needle) return null;
  for (const m of models) {
    if (m.toLowerCase() === needle) return m;
  }
  for (const m of models) {
    if (m.toLowerCase().includes(needle) || needle.includes(m.toLowerCase())) {
      return m;
    }
  }
  return null;
}
