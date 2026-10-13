import { describe, expect, it } from "vitest";
import { browserInfo } from "@/lib/phone/inApp";
import { micLevel, reloadVerdict, summaryLine, tonePcm, type MicTestReport } from "./micTest";

describe("micLevel", () => {
  it("maps RMS on a dB scale: -60 dB and below is 0, full scale is 1", () => {
    expect(micLevel(0)).toBe(0);
    expect(micLevel(0.001)).toBe(0);
    expect(micLevel(1)).toBe(1);
    expect(micLevel(2)).toBe(1);
    expect(micLevel(0.03162)).toBeCloseTo(0.5, 2); // -30 dB
  });
});

describe("tonePcm", () => {
  it("is ms long at the rate, starts and ends silent (no click), and peaks below full scale", () => {
    const pcm = tonePcm(440, 500, 24000);
    expect(pcm.length).toBe(12000);
    expect(pcm[0]).toBe(0);
    expect(Math.abs(pcm[pcm.length - 1])).toBeLessThan(200);
    const peak = Math.max(...Array.from(pcm, Math.abs));
    expect(peak).toBeGreaterThan(5000);
    expect(peak).toBeLessThan(0x7fff);
  });
});

describe("reloadVerdict", () => {
  it("needs an earlier grant in this tab; then the permission state before the second test decides", () => {
    expect(reloadVerdict(false, "granted")).toBe("test, reload, test again");
    expect(reloadVerdict(true, "granted")).toBe("remembered");
    expect(reloadVerdict(true, "prompt")).toBe("not remembered");
    expect(reloadVerdict(true, "denied")).toBe("denied");
    expect(reloadVerdict(true, "unknown")).toBe("unknown, did the browser ask again?");
  });
});

const IOS_KAKAO =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0";

describe("summaryLine", () => {
  const base: MicTestReport = {
    browser: browserInfo(IOS_KAKAO),
    secure: true,
    worklet: true,
    mic: null,
    speaker: null,
    reload: "test, reload, test again",
  };

  it("says what was not tested yet", () => {
    expect(summaryLine(base)).toBe(
      "KIBO mic-test | iOS WebKit | in-app: KakaoTalk | https: yes | worklet: yes | mic: not tested | speaker: not tested | reload: test, reload, test again",
    );
  });

  it("one line with permission before and after, rates, peak, speaker state and the reload verdict", () => {
    const line = summaryLine({
      ...base,
      browser: browserInfo("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36"),
      mic: { outcome: "ok", before: "prompt", after: "granted", contextRate: 48000, trackRate: 48000, peak: 0.42 },
      speaker: { state: "running", played: true },
      reload: "remembered",
    });
    expect(line).toBe(
      "KIBO mic-test | Android Chrome | in-app: no | https: yes | worklet: yes | mic: ok (prompt -> granted), 48000 Hz, track 48000 Hz, peak 42% | speaker: running after tap, tone played | reload: remembered",
    );
    expect(line).not.toContain("\n");
  });

  it("a desktop browser is named by its family alone", () => {
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
    expect(summaryLine({ ...base, browser: browserInfo(mac) })).toMatch(/^KIBO mic-test \| Chrome \| in-app: no \|/);
  });

  it("a refused mic and a speaker that did not start", () => {
    const line = summaryLine({
      ...base,
      mic: { outcome: "denied", before: "unknown", after: "denied", contextRate: null, trackRate: null, peak: 0 },
      speaker: { state: "suspended", played: false },
    });
    expect(line).toContain("mic: denied (unknown -> denied)");
    expect(line).not.toContain("Hz");
    expect(line).toContain("speaker: suspended after tap, tone not played");
  });
});
