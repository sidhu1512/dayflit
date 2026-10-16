import * as chrono from "chrono-node";
import { format, addDays, addWeeks, addMonths, addYears, differenceInDays, startOfDay } from "date-fns";

export interface CalculatorResult {
  type: "math" | "time" | "date";
  query: string;
  result: string;
  detail?: string;
}

// ==========================================
// 1. Math Evaluator (Safe Recursive Descent)
// ==========================================

// Token types for arithmetic
type TokenType = "NUMBER" | "OP" | "LPAREN" | "RPAREN" | "FUNC" | "PERCENT";
interface Token {
  type: TokenType;
  value: string;
}

function tokenizeMath(expr: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  const s = expr.trim();

  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }

    if (/[0-9.]/.test(c)) {
      let numStr = "";
      while (i < s.length && /[0-9.]/.test(s[i])) {
        numStr += s[i];
        i++;
      }
      if ((numStr.match(/\./g) || []).length > 1) return null;
      tokens.push({ type: "NUMBER", value: numStr });
      continue;
    }

    if (c === "+" || c === "-" || c === "*" || c === "/" || c === "^" || c === "×" || c === "÷") {
      const op = c === "×" ? "*" : c === "÷" ? "/" : c;
      tokens.push({ type: "OP", value: op });
      i++;
      continue;
    }

    if (c === "(") {
      tokens.push({ type: "LPAREN", value: "(" });
      i++;
      continue;
    }

    if (c === ")") {
      tokens.push({ type: "RPAREN", value: ")" });
      i++;
      continue;
    }

    if (c === "%") {
      tokens.push({ type: "PERCENT", value: "%" });
      i++;
      continue;
    }

    if (/[a-zA-Z]/.test(c)) {
      let word = "";
      while (i < s.length && /[a-zA-Z]/.test(s[i])) {
        word += s[i];
        i++;
      }
      const lower = word.toLowerCase();
      if (["sqrt", "abs", "round", "floor", "ceil", "sin", "cos", "tan", "log", "ln"].includes(lower)) {
        tokens.push({ type: "FUNC", value: lower });
      } else {
        return null;
      }
      continue;
    }

    return null;
  }
  return tokens;
}

class MathParser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  public parse(): number {
    const res = this.expr();
    if (this.pos < this.tokens.length) {
      throw new Error("Unexpected trailing tokens");
    }
    return res;
  }

  // expr = term ((+ | -) term)*
  private expr(): number {
    let res = this.term();
    while (this.pos < this.tokens.length) {
      const t = this.peek();
      if (t && t.type === "OP" && (t.value === "+" || t.value === "-")) {
        this.consume();
        const next = this.term();
        res = t.value === "+" ? res + next : res - next;
      } else {
        break;
      }
    }
    return res;
  }

  // term = power ((* | /) power)*
  private term(): number {
    let res = this.power();
    while (this.pos < this.tokens.length) {
      const t = this.peek();
      if (t && t.type === "OP" && (t.value === "*" || t.value === "/")) {
        this.consume();
        const next = this.power();
        if (t.value === "/" && next === 0) throw new Error("Division by zero");
        res = t.value === "*" ? res * next : res / next;
      } else {
        break;
      }
    }
    return res;
  }

  // power = factor (^ power)?
  private power(): number {
    const base = this.factor();
    if (this.pos < this.tokens.length) {
      const t = this.peek();
      if (t && t.type === "OP" && t.value === "^") {
        this.consume();
        const exp = this.power();
        return Math.pow(base, exp);
      }
    }
    return base;
  }

  // factor = unary | (expr) | func(expr)
  private factor(): number {
    const t = this.peek();
    if (!t) throw new Error("Unexpected end of input");

    if (t.type === "OP" && (t.value === "+" || t.value === "-")) {
      this.consume();
      const val = this.factor();
      return t.value === "-" ? -val : val;
    }

    if (t.type === "NUMBER") {
      this.consume();
      let val = parseFloat(t.value);
      if (this.peek()?.type === "PERCENT") {
        this.consume();
        val = val / 100;
      }
      return val;
    }

    if (t.type === "FUNC") {
      this.consume();
      if (this.peek()?.type !== "LPAREN") throw new Error("Expected ( after function");
      this.consume();
      const arg = this.expr();
      if (this.peek()?.type !== "RPAREN") throw new Error("Expected ) after function argument");
      this.consume();

      switch (t.value) {
        case "sqrt":
          if (arg < 0) throw new Error("Square root of negative number");
          return Math.sqrt(arg);
        case "abs":
          return Math.abs(arg);
        case "round":
          return Math.round(arg);
        case "floor":
          return Math.floor(arg);
        case "ceil":
          return Math.ceil(arg);
        case "sin":
          return Math.sin(arg);
        case "cos":
          return Math.cos(arg);
        case "tan":
          return Math.tan(arg);
        case "log":
          return Math.log10(arg);
        case "ln":
          return Math.log(arg);
        default:
          return arg;
      }
    }

    if (t.type === "LPAREN") {
      this.consume();
      const val = this.expr();
      if (this.peek()?.type !== "RPAREN") throw new Error("Mismatched parentheses");
      this.consume();
      if (this.peek()?.type === "PERCENT") {
        this.consume();
        return val / 100;
      }
      return val;
    }

    throw new Error(`Unexpected token ${t.value}`);
  }
}

export function evaluateMath(input: string): CalculatorResult | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Check for percentage idioms:
  // e.g. "18% of 4200" or "18 percent of 4200"
  const percentOfMatch = trimmed.match(/^([0-9.]+)\s*(?:%|percent)\s+of\s+([0-9.]+)$/i);
  if (percentOfMatch) {
    const pct = parseFloat(percentOfMatch[1]);
    const total = parseFloat(percentOfMatch[2]);
    if (!isNaN(pct) && !isNaN(total)) {
      const val = (pct / 100) * total;
      const formatted = Number.isInteger(val) ? val.toString() : val.toFixed(2).replace(/\.?0+$/, "");
      return {
        type: "math",
        query: input,
        result: formatted,
        detail: `${pct}% of ${total} = ${formatted}`,
      };
    }
  }

  // e.g. "4200 + 15%" or "500 - 20%"
  const percentAddSubMatch = trimmed.match(/^([0-9.]+)\s*([+-])\s*([0-9.]+)\s*%$/i);
  if (percentAddSubMatch) {
    const base = parseFloat(percentAddSubMatch[1]);
    const op = percentAddSubMatch[2];
    const pct = parseFloat(percentAddSubMatch[3]);
    if (!isNaN(base) && !isNaN(pct)) {
      const delta = base * (pct / 100);
      const val = op === "+" ? base + delta : base - delta;
      const formatted = Number.isInteger(val) ? val.toString() : val.toFixed(2).replace(/\.?0+$/, "");
      return {
        type: "math",
        query: input,
        result: formatted,
        detail: `${base} ${op} ${pct}% (${op === "+" ? "+" : "-"}${delta.toFixed(2).replace(/\.?0+$/, "")}) = ${formatted}`,
      };
    }
  }

  // Must contain at least one math operator or function to be recognized as math (avoiding plain numbers)
  if (!/[+\-*/^×÷]|sqrt|abs|round|floor|ceil|sin|cos|tan|log|ln/.test(trimmed)) {
    return null;
  }

  try {
    const tokens = tokenizeMath(trimmed);
    if (!tokens || tokens.length < 2) return null;
    const parser = new MathParser(tokens);
    const value = parser.parse();
    if (isNaN(value) || !isFinite(value)) return null;

    let formatted: string;
    if (Number.isInteger(value)) {
      formatted = value.toLocaleString();
    } else {
      const rounded = Math.round(value * 100000) / 100000;
      formatted = rounded.toString();
    }

    return {
      type: "math",
      query: input,
      result: formatted,
      detail: `= ${formatted}`,
    };
  } catch {
    return null;
  }
}

// ==========================================
// 2. Time Math Evaluator
// ==========================================

// Parse strings like "45m", "1h", "1h 30m", "90 mins", "2 hours", "1d" into minutes
function parseDurationUnit(str: string): number | null {
  let totalMin = 0;
  let matched = false;

  // Days
  const dMatch = str.match(/([0-9.]+)\s*(?:d|days?)/i);
  if (dMatch) {
    totalMin += parseFloat(dMatch[1]) * 1440;
    matched = true;
  }

  // Hours
  const hMatch = str.match(/([0-9.]+)\s*(?:h|hrs?|hours?)/i);
  if (hMatch) {
    totalMin += parseFloat(hMatch[1]) * 60;
    matched = true;
  }

  // Minutes
  const mMatch = str.match(/([0-9.]+)\s*(?:m|mins?|minutes?)/i);
  if (mMatch) {
    totalMin += parseFloat(mMatch[1]);
    matched = true;
  }

  return matched ? totalMin : null;
}

function formatMinutes(min: number): string {
  const sign = min < 0 ? "-" : "";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = Math.round(abs % 60);

  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

export function evaluateTime(input: string): CalculatorResult | null {
  const trimmed = input.trim();
  // Check if expression looks like time math: e.g. "45m + 1h 35m", "2h - 45m"
  if (!/(?:[0-9.]+\s*(?:m|min|mins|minutes|h|hr|hrs|hours|d|days))\s*[+-]/.test(trimmed)) {
    return null;
  }

  // Split by + and - preserving signs
  const parts = trimmed.split(/(?=[+-])/);
  let totalMin = 0;
  let validCount = 0;

  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    const sign = p.startsWith("-") ? -1 : 1;
    const clean = p.replace(/^[+-]\s*/, "");
    const dur = parseDurationUnit(clean);
    if (dur === null) return null;
    totalMin += sign * dur;
    validCount++;
  }

  if (validCount < 2) return null;

  const resultStr = formatMinutes(totalMin);
  const detailStr = `${resultStr} (${Math.round(totalMin)} minutes)`;

  return {
    type: "time",
    query: input,
    result: resultStr,
    detail: detailStr,
  };
}

// ==========================================
// 3. Date & Natural Language Query Evaluator
// ==========================================

export function evaluateDate(input: string): CalculatorResult | null {
  const trimmed = input.trim().toLowerCase();

  // Pattern: "days until <date>" or "days to <date>"
  const daysUntilMatch = trimmed.match(/^days?\s+(?:until|to)\s+(.+)$/i);
  if (daysUntilMatch) {
    const targetStr = daysUntilMatch[1];
    const parsed = chrono.casual.parse(targetStr, new Date(), { forwardDate: true });
    if (parsed.length > 0) {
      const targetDate = parsed[0].start.date();
      const today = startOfDay(new Date());
      const diff = differenceInDays(startOfDay(targetDate), today);
      const formattedDate = format(targetDate, "EEEE, MMMM d, yyyy");
      return {
        type: "date",
        query: input,
        result: diff === 0 ? "Today" : diff === 1 ? "1 day" : `${diff} days`,
        detail: `Until ${formattedDate}`,
      };
    }
  }

  // Pattern: "days since <date>"
  const daysSinceMatch = trimmed.match(/^days?\s+since\s+(.+)$/i);
  if (daysSinceMatch) {
    const targetStr = daysSinceMatch[1];
    const parsed = chrono.casual.parse(targetStr, new Date(), { forwardDate: false });
    if (parsed.length > 0) {
      const targetDate = parsed[0].start.date();
      const today = startOfDay(new Date());
      const diff = differenceInDays(today, startOfDay(targetDate));
      const formattedDate = format(targetDate, "EEEE, MMMM d, yyyy");
      return {
        type: "date",
        query: input,
        result: diff === 0 ? "Today" : diff === 1 ? "1 day ago" : `${diff} days ago`,
        detail: `Since ${formattedDate}`,
      };
    }
  }

  // Pattern: "<N> weeks from <day/date>" e.g. "3 weeks from friday"
  const weeksFromMatch = trimmed.match(/^([0-9.]+)\s*weeks?\s+from\s+(.+)$/i);
  if (weeksFromMatch) {
    const count = parseFloat(weeksFromMatch[1]);
    const refStr = weeksFromMatch[2];
    const parsed = chrono.casual.parse(refStr, new Date(), { forwardDate: true });
    if (parsed.length > 0) {
      const refDate = parsed[0].start.date();
      const target = addWeeks(refDate, count);
      return {
        type: "date",
        query: input,
        result: format(target, "EEEE, MMMM d, yyyy"),
        detail: `${count} weeks from ${format(refDate, "EEEE, MMM d")}`,
      };
    }
  }

  // Pattern: "<N> days from <day/date>"
  const daysFromMatch = trimmed.match(/^([0-9.]+)\s*days?\s+from\s+(.+)$/i);
  if (daysFromMatch) {
    const count = parseFloat(daysFromMatch[1]);
    const refStr = daysFromMatch[2];
    const parsed = chrono.casual.parse(refStr, new Date(), { forwardDate: true });
    if (parsed.length > 0) {
      const refDate = parsed[0].start.date();
      const target = addDays(refDate, count);
      return {
        type: "date",
        query: input,
        result: format(target, "EEEE, MMMM d, yyyy"),
        detail: `${count} days from ${format(refDate, "EEEE, MMM d")}`,
      };
    }
  }

  // General natural date query (e.g. "in 5 days", "3 months from now", "next friday")
  // Only trigger if query starts with explicit date triggers to avoid false positives on normal search
  if (/^(?:in\s+[0-9]+|next\s+[a-z]+|tomorrow|yesterday|[0-9]+\s+(?:days|weeks|months|years)\s+(?:from\s+now|ago))/.test(trimmed)) {
    const parsed = chrono.casual.parse(trimmed, new Date());
    if (parsed.length > 0 && parsed[0].text.length >= trimmed.length - 2) {
      const d = parsed[0].start.date();
      const hasTime = parsed[0].start.isCertain("hour");
      const resultStr = hasTime ? format(d, "EEE, MMM d, yyyy · h:mm a") : format(d, "EEEE, MMMM d, yyyy");
      return {
        type: "date",
        query: input,
        result: resultStr,
        detail: format(d, "yyyy-MM-dd"),
      };
    }
  }

  return null;
}

// ==========================================
// 4. Unified Calculator Entrypoint
// ==========================================

export function parseCalculatorQuery(input: string): CalculatorResult | null {
  if (!input) return null;
  const q = input.trim();
  if (q.length < 2) return null;

  // 1. Math
  const math = evaluateMath(q);
  if (math) return math;

  // 2. Time Math
  const time = evaluateTime(q);
  if (time) return time;

  // 3. Date Math
  const date = evaluateDate(q);
  if (date) return date;

  return null;
}
