import { describe, expect, it } from "vitest";
import { browserInfo, inAppName, isInAppBrowser } from "./inApp";

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

const IOS_CHROME = IOS_SAFARI.replace("Version/18.0", "CriOS/129.0.6668.69");
// A real Instagram iOS build that also carries Facebook's tokens.
const INSTAGRAM_FB = `${IOS_SAFARI} [FBAN/FBIOS;FBAV/480.0] Instagram 350.0.0.0`;

describe("browserInfo (/mic-test)", () => {
  it.each([
    ["KakaoTalk on iOS", `${IOS_SAFARI} KAKAOTALK 10.8.0`, { os: "iOS", family: "Safari", inApp: "KakaoTalk" }],
    ["NAVER on Android", `${ANDROID_CHROME} NAVER(inapp; search; 2000; 12.8.1)`, { os: "Android", family: "Chrome", inApp: "NAVER" }],
    ["Instagram with FBAN tokens", INSTAGRAM_FB, { os: "iOS", family: "Safari", inApp: "Instagram" }],
    ["Facebook", `${IOS_SAFARI} [FBAN/FBIOS;FBAV/480.0.0.0]`, { os: "iOS", family: "Safari", inApp: "Facebook" }],
    ["LINE", `${ANDROID_CHROME} Line/14.16.0`, { os: "Android", family: "Chrome", inApp: "LINE" }],
    ["iOS Safari", IOS_SAFARI, { os: "iOS", family: "Safari", inApp: null }],
    ["Chrome on iOS", IOS_CHROME, { os: "iOS", family: "Chrome", inApp: null }],
    ["Android Chrome", ANDROID_CHROME, { os: "Android", family: "Chrome", inApp: null }],
    ["Samsung Internet", ANDROID_CHROME.replace("Chrome/", "SamsungBrowser/26.0 Chrome/"), { os: "Android", family: "Samsung Internet", inApp: null }],
    [
      "KakaoTalk's real iOS agent (a WebKit view, no Safari token)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0",
      { os: "iOS", family: "WebKit", inApp: "KakaoTalk" },
    ],
    ["an unknown agent", "curl/8.7.1", { os: "other", family: "Other", inApp: null }],
  ])("%s", (_name, ua, want) => {
    expect(browserInfo(ua)).toEqual(want);
    expect(inAppName(ua)).toBe(want.inApp);
  });
});
