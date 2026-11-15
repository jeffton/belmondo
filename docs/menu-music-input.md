# Menu music activation

Menu keys are handled with a virtual cursor while DOM focus can remain on `body`. The music unlock listener captures those trusted keydowns on `window`, before navigation changes the menu. Pointer/touch clicks retain their existing path. Explicit music pause, zero volume and focus interruption keep their existing behavior.

Controller startup uses two browser paths:

- Chromium grants user activation when native `getGamepads()` samples a button value above 0.9. BELMONDO requests playback during menu polling after a menu control is used. A stick alone does not grant Chromium activation; press a button.
- WebKit grants an audio gesture inside native `gamepadconnected` dispatch. BELMONDO calls resume/play synchronously inside that callback, before awaiting anything. Safari versions or site settings that block this still require keyboard/touch/click activation. Polling alone does not grant WebKit the same gesture.

No synthetic clicks, autoplay-policy bypass, muted bootstrap, popup or extra music element is used. Synthetic gamepad events do not unlock music. Initial Chromium connection can precede activation; a rejected attempt is superseded by the subsequent native button sample.

## Verification

`GAME_URL=http://127.0.0.1:5194 node tests/menu-music-input.browser.mjs` runs Chromium with strict document-user-activation policy and no media-engagement bypass. Its CDP probes explicitly set `userGesture:false`. It checks first arrow/Enter from body focus, rejected synthetic input/gamepad mocks, single-element playback, focus lifecycle routing, zero music gain, explicit pause and pointer startup. Focus lifecycle is simulated; media playback and browser activation are real.

An isolated Linux uinput Xbox controller was additionally tested against native Chromium 158 `getGamepads()` with strict autoplay. No pointer, keyboard or CDP user gesture preceded its A press. Before the button, sticky activation was false; afterward it was true and the actual soundtrack played unmuted and advanced. The temporary device was destroyed afterward. This verifies the browser-native controller path, not physical controller hardware. Safari hardware was not tested.

## Sources

- [Chromium gamepad polling activation](https://chromium.googlesource.com/chromium/src.git/+/refs/heads/main/third_party/blink/renderer/modules/gamepad/navigator_gamepad.cc)
- [Chromium button threshold](https://chromium.googlesource.com/chromium/src.git/+/refs/heads/main/third_party/blink/renderer/modules/gamepad/gamepad_comparisons.cc)
- [WebKit gamepadconnected audio gesture and regression test](https://github.com/WebKit/WebKit/commit/642206b4fe41ffa4b671f18ccae0d828a97405ec)
- [Chrome autoplay policy](https://developer.chrome.com/blog/autoplay/)
- [Trusted activation events](https://developer.mozilla.org/en-US/docs/Web/Security/User_activation)
