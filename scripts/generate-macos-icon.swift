import AppKit
import Foundation

let outputPath = CommandLine.arguments.dropFirst().first ?? "dist/CodexCNPlusPlus.iconset"
let outputURL = URL(fileURLWithPath: outputPath)
try? FileManager.default.removeItem(at: outputURL)
try FileManager.default.createDirectory(at: outputURL, withIntermediateDirectories: true)

let sizes: [(String, Int)] = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024),
]

for (name, size) in sizes {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()
    drawIcon(size: CGFloat(size))
    image.unlockFocus()

    guard let tiff = image.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiff),
          let png = bitmap.representation(using: .png, properties: [:]) else {
        fatalError("无法生成图标：\(name)")
    }
    try png.write(to: outputURL.appendingPathComponent(name))
}

func drawIcon(size: CGFloat) {
    let scale = size / 1024.0
    func s(_ value: CGFloat) -> CGFloat { value * scale }
    let bounds = NSRect(x: 0, y: 0, width: size, height: size)

    let bg = NSBezierPath(roundedRect: bounds, xRadius: s(224), yRadius: s(224))
    NSGradient(colors: [
        NSColor(calibratedRed: 0.08, green: 0.15, blue: 0.23, alpha: 1),
        NSColor(calibratedRed: 0.09, green: 0.17, blue: 0.18, alpha: 1),
        NSColor(calibratedRed: 0.06, green: 0.09, blue: 0.16, alpha: 1),
    ])?.draw(in: bg, angle: -48)

    let accent = NSColor(calibratedRed: 0.30, green: 0.93, blue: 0.82, alpha: 1)
    accent.setStroke()
    let left = NSBezierPath()
    left.lineWidth = s(72)
    left.lineCapStyle = .round
    left.lineJoinStyle = .round
    left.move(to: NSPoint(x: s(252), y: s(350)))
    left.line(to: NSPoint(x: s(144), y: s(512)))
    left.line(to: NSPoint(x: s(252), y: s(674)))
    left.stroke()

    let right = NSBezierPath()
    right.lineWidth = s(72)
    right.lineCapStyle = .round
    right.lineJoinStyle = .round
    right.move(to: NSPoint(x: s(772), y: s(350)))
    right.line(to: NSPoint(x: s(880), y: s(512)))
    right.line(to: NSPoint(x: s(772), y: s(674)))
    right.stroke()

    NSColor(calibratedWhite: 0.98, alpha: 0.96).setFill()
    NSBezierPath(ovalIn: NSRect(x: s(244), y: s(244), width: s(536), height: s(536))).fill()

    let ink = NSColor(calibratedRed: 0.06, green: 0.12, blue: 0.19, alpha: 1)
    ink.setFill()
    NSBezierPath(roundedRect: NSRect(x: s(344), y: s(678), width: s(424), height: s(48)), xRadius: s(24), yRadius: s(24)).fill()
    NSBezierPath(rect: NSRect(x: s(330), y: s(545), width: s(364), height: s(74))).fill()
    NSBezierPath(rect: NSRect(x: s(462), y: s(253), width: s(88), height: s(492))).fill()
    NSBezierPath(rect: NSRect(x: s(292), y: s(379), width: s(430), height: s(74))).fill()

    let plus = "++" as NSString
    plus.draw(
        in: NSRect(x: s(642), y: s(130), width: s(240), height: s(168)),
        withAttributes: [
            .font: NSFont.systemFont(ofSize: s(154), weight: .heavy),
            .foregroundColor: accent,
            .kern: s(-4),
        ]
    )
}
