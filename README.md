# Dopamine (prank demo)

A fake, harmless jailbreak app made as a joke. It shows a device card, a fake
exploit console, a fake "reboot" with the Apple logo, then reveals itself:

> This was a fake demo — thank you for doing this.

Nothing is installed, nothing is exploited, and nothing leaves the device.

## Notes

- Web app (PWA). On iPhone: open the page in Safari, Share → Add to Home Screen.
- The Apple logo in the fake reboot is the system glyph, so it only appears on
  Apple devices.
- Not affiliated with Apple, or with the real Dopamine jailbreak. Icon is original.
- No real jailbreak exists for iOS 27.0; this is only a UI simulation.

## Install on an iPhone with a Mac

Xcode signs the app with your own Apple ID, no Sideloadly needed.

1. Install Xcode from the App Store.
2. Clone or download this repo, then in Terminal:
   `bash ios/mac-setup.sh`
3. In Xcode: **Settings > Accounts** > add your Apple ID.
4. Select the **Dopamine** target > **Signing & Capabilities** > pick your Team.
   If the bundle identifier is taken, change `com.demo.dopamine` to something unique.
5. Plug in the iPhone, choose it at the top, press **Run**.
6. First launch: iPhone **Settings > General > VPN & Device Management** > Trust your Apple ID.

The free signing lasts 7 days; press Run again to renew it.