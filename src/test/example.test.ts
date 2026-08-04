import { describe, it, expect } from "vitest";
import {
  getDominoRoundReason,
  getDominoSoloThreshold,
  getDominoTarget,
  isDominoDoubleSixOut,
  isDominoGameWin,
  isDominoSoloWin,
  isDominoFortyInstantWin,
  getBlockedRoundResult,
} from "@/lib/dominoRules";

describe("domino rules lock", () => {
  it("D80 sy D120 ihany no target marina", () => {
    expect(getDominoTarget("d80")).toBe(80);
    expect(getDominoTarget("d120")).toBe(120);
    expect(getDominoTarget("hand")).toBe(120);
  });

  it("tsy mandresy raha tsy tonga target", () => {
    expect(isDominoGameWin(79, "d80")).toBe(false);
    expect(isDominoGameWin(119, "d120")).toBe(false);
    expect(isDominoGameWin(17, "d80")).toBe(false);
    expect(isDominoGameWin(43, "d120")).toBe(false);
  });

  it("mandresy raha vao tonga target", () => {
    expect(isDominoGameWin(80, "d80")).toBe(true);
    expect(isDominoGameWin(120, "d120")).toBe(true);
    expect(isDominoGameWin(121, "d120")).toBe(true);
  });

  it("mandeha irery raha tratra ny seuil amin'ny total score ary mbola 0 ny adversaire", () => {
    expect(getDominoSoloThreshold("d80")).toBe(40);
    expect(getDominoSoloThreshold("d120")).toBe(40);
    expect(isDominoSoloWin(40, "d80", [0])).toBe(true);
    expect(isDominoSoloWin(40, "d120", [0, 0])).toBe(true);
    expect(isDominoSoloWin(39, "d80", [0])).toBe(false);
    expect(isDominoSoloWin(60, "d120", [0, 1])).toBe(false);
    expect(isDominoSoloWin(25, "d80", [0])).toBe(false);
  });

  it("40 Indray Maka ends either match mode immediately", () => {
    expect(isDominoFortyInstantWin(40)).toBe(true);
    expect(isDominoFortyInstantWin(57)).toBe(true);
    expect(isDominoFortyInstantWin(39)).toBe(false);
  });

  it.each([
    [[{ id: "A", pips: 7 }, { id: "B", pips: 13 }], { winnerId: "A", points: 13, tied: false }],
    [[{ id: "A", pips: 5 }, { id: "B", pips: 12 }, { id: "C", pips: 8 }], { winnerId: "A", points: 20, tied: false }],
    [[{ id: "A", pips: 3 }, { id: "B", pips: 9 }, { id: "C", pips: 11 }, { id: "D", pips: 15 }], { winnerId: "A", points: 35, tied: false }],
  ])("blocked scoring sums opponents only", (players, expected) => {
    expect(getBlockedRoundResult(players)).toEqual(expected);
  });

  it("blocked scoring is exact for every supported Domino player count", () => {
    expect(getBlockedRoundResult([{ id: "A", pips: 5 }, { id: "B", pips: 12 }])).toEqual({ winnerId: "A", points: 12, tied: false });
    expect(getBlockedRoundResult([{ id: "A", pips: 5 }, { id: "B", pips: 12 }, { id: "C", pips: 8 }])).toEqual({ winnerId: "A", points: 20, tied: false });
    expect(getBlockedRoundResult([{ id: "A", pips: 5 }, { id: "B", pips: 12 }, { id: "C", pips: 8 }, { id: "D", pips: 9 }])).toEqual({ winnerId: "A", points: 29, tied: false });
    expect(getBlockedRoundResult([{ id: "A", pips: 5 }, { id: "B", pips: 5 }, { id: "C", pips: 8 }])).toEqual({ winnerId: null, points: 0, tied: true });
  });

  it("double 6 out dia [6|6] farany sady nahazo isa", () => {
    expect(isDominoDoubleSixOut([6, 6], 21)).toBe(true);
    expect(isDominoDoubleSixOut([6, 6], 0)).toBe(true);
    expect(isDominoDoubleSixOut([6, 5], 21)).toBe(false);
  });

  it("reason dia tsy maintsy target ihany no MANDRESY NY LALAO", () => {
    expect(getDominoRoundReason({ winnerName: "Rami", mode: "d80", winnerScore: 17, points: 17 })).toBe("Tour vita — Rami nahazo +17 isa");
    expect(getDominoRoundReason({ winnerName: "Rami", mode: "d80", winnerScore: 80, points: 8 })).toBe("MANDRESY NY LALAO — Rami tonga 80");
    expect(getDominoRoundReason({ winnerName: "Rami", mode: "d120", winnerScore: 120, points: 12, reasonOverride: "double 6" })).toBe("MANDRESY NY LALAO — Rami tonga 120");
  });
});
