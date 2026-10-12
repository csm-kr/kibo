// In-app browsers (KakaoTalk, NAVER, Instagram, Facebook, LINE) often block the microphone (docs/UX.md
// "Accessibility"), so the phone suggests opening the link in Safari or Chrome.
const IN_APP = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN\/|FBAV\/|FB_IAB|\bLine\//i;

export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP.test(userAgent);
}
