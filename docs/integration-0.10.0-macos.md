# 0.10.0 local patch integration

Applied the downloaded patch cleanly to 4278011 without conflicts or folder replacement. Groq/server/evaluation env files remain byte-for-byte identical. Existing live-verification reports remain unchanged. No backup copies or new live evaluation requests.

Installed pinned Checkov **3.4.5** with Python **3.11** outside reviewed projects at /Users/owen/.local/share/changeproof/checkov. Configured only the user-level changeproof.checkovPath; other settings/comments preserved. pip check passes; resolved dependency versions are recorded in artifacts/checkov-3.4.5-macos-freeze.txt.

The patch's guard initially failed closed on macOS metadata. A narrow port permits only canonical /System/Library/CoreServices/SystemVersion.plist, while denying neighboring files; architecture metadata uses Python's pointer-size fallback without spawning file. Guard network, arbitrary subprocess and outside read/write restrictions remain active. A separate Git maintenance race in synthetic demo setup was fixed by disabling automatic maintenance only for that fixture, preserving its strict repository comparison.

**130/130 tests pass, zero skipped**, including real offline Checkov findings, safe controls, guard restrictions, existing code checks, AI profile/mock API tests and UI navigation/staleness. Extension/backend builds and all 12 local AI fixture collections pass. No live provider calls.

Installed artifacts/changeproof-local-0.10.0.vsix locally. All installed source/bundles match this build; the manifest matches excluding VS Code's own __metadata annotation. The installed CLI produced schema 5.0.0 and assessed all four configuration frameworks on synthetic fixtures. Guard network/subprocess/outside-read/outside-write counts were all zero; fixed metadata probes were counted separately. VSIX SHA-256: da5a1f628ec360f36c13540694fe89d8296b081d9e089abeb4944c3bcec7a34e.

macOS denied assistive access before the existing window could be identified; no automatic reload was performed and no additional window opened. Run **Developer: Reload Window** once in the existing window. No native visual or reloaded editor-host verification is claimed. The imported feature-scope verification artifact documents the patch author's checks; this document and artifacts/integration-0.10.0-macos.json record the checks actually run here.
