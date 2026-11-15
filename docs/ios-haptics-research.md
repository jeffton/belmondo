# iPhone touch haptics — evidence and isolated probe

Investigated 2026-11-15. No production integration or deployment.

## Conclusion

Native switch haptics are real on iPhone. Arbitrary game-event vibration is not a supported Safari API. A real user tap on a switch/associated label can produce one system tick; a scripted click, even from a genuine tap handler, is deliberately blocked in patched WebKit. A collision, landing or boost detected in the game loop cannot become a trusted user event. Keeping a finger on a joystick does not confer trust on later scripted clicks.

The isolated `experiments/ios-haptics/index.html` compares a visible switch, direct label tap, synchronous scripted label click and next-frame scripted click. It uses no dependencies, audio, controller actuators, storage or telemetry. Open it on actual iPhone hardware in Safari and from the home screen; its log records DOM events, not physical haptic success. The manifest permits standalone presentation; the host must serve it over HTTPS. No native app or service worker is required for this comparison.

## Primary evidence

- [WebKit: HTML switch](https://webkit.org/blog/15054/an-html-switch-control/) introduced the control in Safari 17.4. This is not the haptics introduction.
- [WebKit: Safari 18.0](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/) explicitly says iOS 18 adds a single haptic tap when the user taps a switch **on iPhone**. Do not infer iPad hardware support from Safari feature detection.
- [WebKit change 313638@main](https://commits.webkit.org/313638@main), [complete patch](https://github.com/WebKit/WebKit/commit/fc1ef83.patch), dated 2026-05-21: user activation alone was insufficient; programmatic label clicks wrongly became trusted input clicks. The fix preserves untrusted status. The native test specifically clicks a real element whose handler calls `label.click()` and expects no feedback.
- [WebKit checkbox implementation](https://raw.githubusercontent.com/WebKit/WebKit/fc1ef83/Source/WebCore/html/CheckboxInputType.cpp) checks trusted click state and `UserGestureIndicator::processingUserGesture()`. This is not the sticky activation used by some other APIs.
- [MDN: Gamepad visibility](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API): an already-connected controller may not produce a connection event until a button/axis is used in the focused page. Empty `getGamepads()` is not proof that no controller is physically connected.

[Current ios-haptics library](https://github.com/tijnjh/ios-haptics) uses a transparent label receiving the actual tap, instead of scripting `label.click()`. [Third-party testing](https://rapidtoolset.com/en/tool/ios-haptics-tester) places the programmatic-click cutoff at iOS 26.5. The primary WebKit patch proves the restriction, but does not by itself establish the exact shipped iOS build. Do not promise a universal 17.4–26.4 working range: official haptics introduction is iOS 18, and fixes/backports can vary. Test the actual OS/browser. Browser names alone are insufficient: Safari and WebKit-based browsers/home-screen apps share this engine restriction; alternative browser engines are a separate implementation, not an iOS vibration guarantee.

There is no supported WebKit API to select tick strength/pattern, confirm the motor fired, or bypass user/system haptic preferences. PWA installation does not grant native haptics privileges. `navigator.vibrate` is not shipped by iOS Safari; an input `switch` property or trusted event does not prove tactile output.

## BELMONDO audit (99a4feb)

`src/gamepad-rumble.js` uses `pad.vibrationActuator.playEffect('dual-rumble', ...)` for gameplay events and resets on pause/focus loss/disconnect. It controls a controller, not the iPhone Taptic Engine. `src/main.js` polls visible pads, passes race events to this module, and handles touch-fire/joysticks through pointer events with `preventDefault` and pointer capture. There is no touch vibration implementation.

A label overlay is not a drop-in replacement for these pointer controls: it depends on native click/default activation, can change event targets, fires on tap rather than collision/drag, and carries form-control semantics. It needs physical testing and interaction regression tests before any consideration for menu taps. There is no evidence-supported implementation of arbitrary iPhone race-event haptics here.

## Controller guard and hardware verification

The probe starts locked until the tester confirms controllers are physically disconnected. Visible connected pads disable every probe; the guard runs before pointer/click default activation and in a diagnostic frame poll. A connection event latches the lock until reload, and pending frame work is cancelled on lock/background. It never invokes controller vibration. No private device enumeration or permissions changes are used. Automatic absolute exclusion of a physically connected but browser-hidden controller is impossible with the Gamepad API alone.

Verification: Vite build, Prettier and five existing controller-rumble tests pass. The isolated browser check passes in Chromium and Linux WebKit, including native/label input activation, controller lock, pending-frame cancellation, background cancellation, and portrait/landscape layout. Both engines log the scripted click as `trusted=false` even while user activation is true. Independent Sol review approved the source and reran both engines. Linux WebKit required a temporary launch wrapper preserving its bundled libraries and adding the existing ICU74 compatibility libraries; no system or shared browser files were changed.

Physical result: untested. Automated browser checks validate input semantics, lock/cancellation and layout only. To establish a candidate for production, actual iPhone testing must distinguish 1/2 from 3/4, verify Safari versus standalone, test no tick while a visible controller is connected, and verify real BELMONDO pointer controls separately. No production code was changed on this basis.
