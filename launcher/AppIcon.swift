// Renders the app icon into an .iconset folder: swift AppIcon.swift <out.iconset>
// (build.sh turns it into AppIcon.icns with iconutil).
// iOS: swift AppIcon.swift --ios <out.png> → one full-bleed 1024px square (iOS rounds it).

import AppKit

let ios = CommandLine.arguments[1] == "--ios"
let out = URL(fileURLWithPath: CommandLine.arguments[ios ? 2 : 1])

func render(size: Int, fullBleed: Bool = false) -> Data {
    let s = CGFloat(size)
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4,
                               hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

    // macOS icon grid: a rounded square inset from the canvas edge (iOS: the whole canvas)
    let inset = fullBleed ? 0 : s * 0.1
    let rect = NSRect(x: inset, y: inset, width: s - 2 * inset, height: s - 2 * inset)
    let radius = fullBleed ? 0 : rect.width * 0.225
    let shape = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
    
    // Icon gradient: deep midnight blue into electric cyan/teal
    let gradient = NSGradient(colors: [
        NSColor(red: 0.09, green: 0.11, blue: 0.22, alpha: 1.0),
        NSColor(red: 0.13, green: 0.42, blue: 0.85, alpha: 1.0),
        NSColor(red: 0.04, green: 0.70, blue: 0.82, alpha: 1.0)
    ], atLocations: [0.0, 0.6, 1.0], colorSpace: .deviceRGB)!
    gradient.draw(in: shape, angle: -55)

    // Subtle inner border for contrast
    NSColor(white: 1.0, alpha: 0.15).setStroke()
    shape.lineWidth = max(1.0, s * 0.015)
    if !fullBleed { shape.stroke() }

    // SF Symbol: gauge.with.dots.needle.33percent
    let config = NSImage.SymbolConfiguration(pointSize: rect.width * 0.52, weight: .medium)
        .applying(.init(paletteColors: [.white]))
    if let symbol = NSImage(systemSymbolName: "gauge.with.dots.needle.33percent", accessibilityDescription: nil)?.withSymbolConfiguration(config) {
        let sz = symbol.size
        symbol.draw(in: NSRect(x: rect.midX - sz.width / 2, y: rect.midY - sz.height / 2, width: sz.width, height: sz.height))
    }
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

if ios {
    // App Store icons must be opaque — redraw without an alpha channel
    let image = NSBitmapImageRep(data: render(size: 1024, fullBleed: true))!.cgImage!
    let ctx = CGContext(data: nil, width: 1024, height: 1024, bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: 1024, height: 1024))
    try NSBitmapImageRep(cgImage: ctx.makeImage()!).representation(using: .png, properties: [:])!.write(to: out)
    exit(0)
}
try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
for base in [16, 32, 128, 256, 512] {
    try render(size: base).write(to: out.appendingPathComponent("icon_\(base)x\(base).png"))
    try render(size: base * 2).write(to: out.appendingPathComponent("icon_\(base)x\(base)@2x.png"))
}
