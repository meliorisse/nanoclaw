import AppKit
import ApplicationServices
import Foundation
import ScreenCaptureKit
import Vision

struct CollectorConfig {
  var appMatch = "Antigravity"
  var promptForAccessibility = false
}

private let textAttributes = [
  kAXTitleAttribute as String,
  kAXValueAttribute as String,
  kAXDescriptionAttribute as String,
  kAXHelpAttribute as String,
]

private let childAttributes = [
  kAXChildrenAttribute as String,
  kAXVisibleChildrenAttribute as String,
  kAXRowsAttribute as String,
  kAXTabsAttribute as String,
  kAXContentsAttribute as String,
  kAXSelectedChildrenAttribute as String,
]

private func parseArgs() -> CollectorConfig {
  var config = CollectorConfig()
  var iterator = CommandLine.arguments.dropFirst().makeIterator()

  while let arg = iterator.next() {
    switch arg {
    case "--app-match":
      if let value = iterator.next() {
        config.appMatch = value
      }
    case "--prompt":
      config.promptForAccessibility = true
    default:
      break
    }
  }

  return config
}

private func stderr(_ text: String) {
  FileHandle.standardError.write(Data((text + "\n").utf8))
}

@discardableResult
private func requestAccessibility(prompt: Bool) -> Bool {
  if prompt {
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    return AXIsProcessTrustedWithOptions(options)
  }

  return AXIsProcessTrusted()
}

private func copyAttributeValue(_ element: AXUIElement, attribute: String) -> CFTypeRef? {
  var value: CFTypeRef?
  let result = AXUIElementCopyAttributeValue(
    element,
    attribute as CFString,
    &value,
  )
  guard result == .success else {
    return nil
  }
  return value
}

private func copyStringValues(_ element: AXUIElement) -> [String] {
  var lines: [String] = []

  for attribute in textAttributes {
    guard let value = copyAttributeValue(element, attribute: attribute) else {
      continue
    }

    if let string = value as? String {
      let normalized = string
        .replacingOccurrences(of: "\r", with: "\n")
        .split(separator: "\n")
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
      lines.append(contentsOf: normalized)
      continue
    }

    if let number = value as? NSNumber {
      lines.append(number.stringValue)
    }
  }

  return lines
}

private func elementKey(_ element: AXUIElement) -> String {
  String(describing: Unmanaged.passUnretained(element).toOpaque())
}

private func appendUnique(_ input: [String], to output: inout [String]) {
  for line in input {
    guard output.last != line else {
      continue
    }
    output.append(line)
  }
}

private func walk(
  element: AXUIElement,
  visited: inout Set<String>,
  lines: inout [String],
) {
  let key = elementKey(element)
  guard visited.insert(key).inserted else {
    return
  }

  appendUnique(copyStringValues(element), to: &lines)

  for attribute in childAttributes {
    guard let value = copyAttributeValue(element, attribute: attribute) else {
      continue
    }

    if CFGetTypeID(value) == AXUIElementGetTypeID() {
      walk(
        element: value as! AXUIElement,
        visited: &visited,
        lines: &lines,
      )
      continue
    }

    if let children = value as? [AXUIElement] {
      for child in children {
        walk(element: child, visited: &visited, lines: &lines)
      }
    }
  }
}

private func bestRunningApp(matching pattern: String) -> NSRunningApplication? {
  let lowered = pattern.lowercased()
  let candidates = NSWorkspace.shared.runningApplications.filter { app in
    let name = app.localizedName?.lowercased() ?? ""
    let bundleId = app.bundleIdentifier?.lowercased() ?? ""
    return name.contains(lowered) || bundleId.contains(lowered)
  }

  return candidates.first(where: \.isActive) ?? candidates.first
}

private func bestWindowInfo(for app: NSRunningApplication) -> [String: Any]? {
  let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID)
    as? [[String: Any]] ?? []
  let appName = (app.localizedName ?? "").lowercased()

  let candidates = list.filter { item in
    let owner = (item[kCGWindowOwnerName as String] as? String ?? "").lowercased()
    let layer = item[kCGWindowLayer as String] as? Int ?? 0
    let alpha = item[kCGWindowAlpha as String] as? Double ?? 1
    return owner == appName && layer == 0 && alpha > 0.01
  }

  return candidates.first { item in
    let name = (item[kCGWindowName as String] as? String ?? "").lowercased()
    return name.contains("agent manager") || name.contains("antigravity")
  } ?? candidates.first
}

@available(macOS 14.0, *)
private func captureWindowImage(windowId: CGWindowID) -> CGImage? {
  let semaphore = DispatchSemaphore(value: 0)
  var image: CGImage?

  Task {
    defer { semaphore.signal() }

    do {
      let content = try await SCShareableContent.excludingDesktopWindows(
        false,
        onScreenWindowsOnly: true,
      )
      guard let window = content.windows.first(where: { $0.windowID == windowId }) else {
        return
      }

      let filter = SCContentFilter(desktopIndependentWindow: window)
      let configuration = SCStreamConfiguration()
      configuration.width = max(Int(window.frame.width), 1)
      configuration.height = max(Int(window.frame.height), 1)
      configuration.showsCursor = false

      image = try await SCScreenshotManager.captureImage(
        contentFilter: filter,
        configuration: configuration,
      )
    } catch {
      stderr("OCR fallback capture failed: \(error.localizedDescription)")
    }
  }

  semaphore.wait()
  return image
}

private struct OCRHit {
  let text: String
  let rect: CGRect
}

private func performOCR(on image: CGImage) -> [String] {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = false
  request.minimumTextHeight = 0.01

  let handler = VNImageRequestHandler(cgImage: image, options: [:])
  try? handler.perform([request])

  let hits: [OCRHit] = (request.results ?? []).compactMap { observation in
    guard let candidate = observation.topCandidates(1).first else {
      return nil
    }

    let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else {
      return nil
    }

    return OCRHit(text: text, rect: observation.boundingBox)
  }

  let sorted = hits.sorted { lhs, rhs in
    if abs(lhs.rect.midY - rhs.rect.midY) > 0.03 {
      return lhs.rect.midY > rhs.rect.midY
    }
    return lhs.rect.minX < rhs.rect.minX
  }

  var lines: [String] = []
  appendUnique(sorted.map(\.text), to: &lines)
  return lines
}

let config = parseArgs()

guard requestAccessibility(prompt: config.promptForAccessibility) else {
  stderr("Accessibility access is required for AntigravityCollector. Enable AntigravityCollector.app in System Settings -> Privacy & Security -> Accessibility.")
  exit(1)
}

guard let app = bestRunningApp(matching: config.appMatch) else {
  stderr("No running app matched '\(config.appMatch)'.")
  exit(2)
}

let appElement = AXUIElementCreateApplication(app.processIdentifier)
let focusedWindow =
  copyAttributeValue(appElement, attribute: kAXFocusedWindowAttribute as String)
    .map { $0 as! AXUIElement }
let windows =
  (copyAttributeValue(appElement, attribute: kAXWindowsAttribute as String) as? [AXUIElement]) ?? []
let rootWindow = focusedWindow ?? windows.first

var visited = Set<String>()
var lines: [String] = []

if let appName = app.localizedName, !appName.isEmpty {
  lines.append(appName)
}

if let rootWindow {
  walk(element: rootWindow, visited: &visited, lines: &lines)
}

var finalLines = lines
  .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
  .filter { !$0.isEmpty }

if (rootWindow == nil || finalLines.count < 12),
  let windowInfo = bestWindowInfo(for: app),
  let windowNumber = windowInfo[kCGWindowNumber as String] as? NSNumber,
  #available(macOS 14.0, *),
  let image = captureWindowImage(windowId: CGWindowID(windowNumber.uint32Value))
{
  let ocrLines = performOCR(on: image)
  if ocrLines.count > max(finalLines.count - 1, 0) {
    finalLines = [app.localizedName ?? config.appMatch] + ocrLines
  }
}

if finalLines.isEmpty {
  stderr("No visible text was extracted from '\(app.localizedName ?? config.appMatch)'.")
  exit(4)
}

print(finalLines.joined(separator: "\n"))
