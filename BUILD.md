# Build script

Example usage for local macOS DMG packaging via `build-macOS-dmg.sh`.

## Build arm64 (Apple Silicon) for production

```bash
./build-macOS-dmg.sh --environment production
# or explicitly:
./build-macOS-dmg.sh --environment production --arch arm64
```

## Build x64 (Intel) for production

```bash
./build-macOS-dmg.sh --environment production --arch x64
```

## Development environment

```bash
./build-macOS-dmg.sh --environment develop --arch arm64
./build-macOS-dmg.sh --environment develop --arch x64
```

## Arch-pinned package scripts (release-oriented)

```bash
bun run package:mac:arm64
bun run package:mac:x64
bun run package:mac:artifacts
```

Production CI packages both arches as separate DMGs. Do not assume a universal binary.
