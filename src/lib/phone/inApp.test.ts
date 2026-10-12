import { describe, expect, it } from "vitest";
import { isInAppBrowser } from "./inApp";

const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";

describe("isInAppBrowser", () => {
  it.each([
    ["KakaoTalk", `${IOS_SAFARI} KAKAOTALK 10.8.0`],
    ["NAVER", `${ANDROID_CHROME} NAVER(inapp; search; 2000; 12.8.1)`],
    ["Instagram", `${IOS_SAFARI} Instagram 350.0.0.0`],
    ["Facebook", `${IOS_SAFARI} [FBAN/FBIOS;FBAV/480.0.0.0]`],
    ["LINE", `${ANDROID_CHROME} Line/14.16.0`],
  ])("detects %s", (_name, ua) => {
    expect(isInAppBrowser(ua)).toBe(true);
  });

  it.each([
    ["iOS Safari", IOS_SAFARI],
    ["Android Chrome", ANDROID_CHROME],
    ["Samsung Internet", ANDROID_CHROME.replace("Chrome/", "SamsungBrowser/26.0 Chrome/")],
    ["a word that only contains 'line'", `${ANDROID_CHROME} Pipeline/1.0`],
  ])("leaves %s alone", (_name, ua) => {
    expect(isInAppBrowser(ua)).toBe(false);
  });
});
