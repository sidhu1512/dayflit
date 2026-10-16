import { describe, expect, it } from "vitest";
import { evaluateDate, evaluateMath, evaluateTime, parseCalculatorQuery } from "./calculator";

describe("Raycast-Grade Instant Calculator Engine", () => {
  describe("evaluateMath", () => {
    it("evaluates basic arithmetic expressions", () => {
      expect(evaluateMath("(1450 * 1.18) / 3")?.result).toBe("570.33333");
      expect(evaluateMath("100 + 25 * 4")?.result).toBe("200");
      expect(evaluateMath("(50 + 25) / 5")?.result).toBe("15");
      expect(evaluateMath("2 ^ 8")?.result).toBe("256");
      expect(evaluateMath("12 × 12")?.result).toBe("144");
      expect(evaluateMath("100 ÷ 4")?.result).toBe("25");
    });

    it("evaluates percentage idioms correctly", () => {
      // "18% of 4200"
      const res1 = evaluateMath("18% of 4200");
      expect(res1?.result).toBe("756");

      // "4200 + 15%"
      const res2 = evaluateMath("4200 + 15%");
      expect(res2?.result).toBe("4830");

      // "500 - 20%"
      const res3 = evaluateMath("500 - 20%");
      expect(res3?.result).toBe("400");
    });

    it("evaluates mathematical functions", () => {
      expect(evaluateMath("sqrt(144)")?.result).toBe("12");
      expect(evaluateMath("abs(-42)")?.result).toBe("42");
      expect(evaluateMath("round(3.7)")?.result).toBe("4");
      expect(evaluateMath("floor(4.9)")?.result).toBe("4");
    });

    it("rejects non-math inputs safely without error", () => {
      expect(evaluateMath("hello world")).toBeNull();
      expect(evaluateMath("buy milk tomorrow")).toBeNull();
      expect(evaluateMath("12345")).toBeNull(); // Plain number without op shouldn't trigger math card
    });
  });

  describe("evaluateTime", () => {
    it("evaluates compound duration math", () => {
      const res1 = evaluateTime("45m + 1h 35m");
      expect(res1?.result).toBe("2h 20m");

      const res2 = evaluateTime("2h - 45m");
      expect(res2?.result).toBe("1h 15m");

      const res3 = evaluateTime("1d + 12h");
      expect(res3?.result).toBe("36h");
    });

    it("rejects non-time inputs", () => {
      expect(evaluateTime("meeting at 2pm")).toBeNull();
      expect(evaluateTime("45 apples + 12 oranges")).toBeNull();
    });
  });

  describe("evaluateDate", () => {
    it("evaluates natural relative date queries", () => {
      const resWeeks = evaluateDate("3 weeks from friday");
      expect(resWeeks).not.toBeNull();
      expect(resWeeks?.type).toBe("date");
      expect(resWeeks?.result).toContain("Friday");

      const resDaysUntil = evaluateDate("days until dec 15");
      expect(resDaysUntil).not.toBeNull();
      expect(resDaysUntil?.type).toBe("date");
      expect(resDaysUntil?.result).toMatch(/[0-9]+ days/);
    });
  });

  describe("parseCalculatorQuery unified entrypoint", () => {
    it("routes math, time and date queries seamlessly", () => {
      expect(parseCalculatorQuery("(1450 * 1.18) / 3")?.type).toBe("math");
      expect(parseCalculatorQuery("18% of 4200")?.type).toBe("math");
      expect(parseCalculatorQuery("45m + 1h 35m")?.type).toBe("time");
      expect(parseCalculatorQuery("3 weeks from friday")?.type).toBe("date");
      expect(parseCalculatorQuery("days until dec 15")?.type).toBe("date");
    });

    it("returns null on normal search terms", () => {
      expect(parseCalculatorQuery("read book")).toBeNull();
      expect(parseCalculatorQuery("gym workout")).toBeNull();
      expect(parseCalculatorQuery("")).toBeNull();
    });
  });
});
