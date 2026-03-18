import AppKit
import ApplicationServices
import Foundation
import ScreenCaptureKit
import Vision

struct CollectorConfig {
  var appMatch = "Antigravity"
  var promptForAccessibility = false
  var sendText: String? = nil
  var conversationTitle: String? = nil
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

private let geometryAttributes = [
  kAXPositionAttribute as String,
  kAXSizeAttribute as String,
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
    case "--send-text":
      if let value = iterator.next() {
        config.sendText = value
      }
    case "--conversation-title":
      if let value = iterator.next() {
        config.conversationTitle = value
      }
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

private func normalizeForMatch(_ text: String) -> String {
  text
    .lowercased()
    .replacingOccurrences(of: "\r", with: "\n")
    .replacingOccurrences(of: "\n", with: " ")
    .split(whereSeparator: \.isWhitespace)
    .joined(separator: " ")
}

private func copyRole(_ element: AXUIElement) -> String? {
  copyAttributeValue(element, attribute: kAXRoleAttribute as String) as? String
}

private func copyPoint(_ element: AXUIElement, attribute: String) -> CGPoint? {
  guard let value = copyAttributeValue(element, attribute: attribute) else {
    return nil
  }
  guard CFGetTypeID(value) == AXValueGetTypeID() else {
    return nil
  }
  let axValue = value as! AXValue
  var point = CGPoint.zero
  guard AXValueGetType(axValue) == .cgPoint else {
    return nil
  }
  guard AXValueGetValue(axValue, .cgPoint, &point) else {
    return nil
  }
  return point
}

private func copySize(_ element: AXUIElement, attribute: String) -> CGSize? {
  guard let value = copyAttributeValue(element, attribute: attribute) else {
    return nil
  }
  guard CFGetTypeID(value) == AXValueGetTypeID() else {
    return nil
  }
  let axValue = value as! AXValue
  var size = CGSize.zero
  guard AXValueGetType(axValue) == .cgSize else {
    return nil
  }
  guard AXValueGetValue(axValue, .cgSize, &size) else {
    return nil
  }
  return size
}

private func copyFrame(_ element: AXUIElement) -> CGRect? {
  guard
    let origin = copyPoint(element, attribute: kAXPositionAttribute as String),
    let size = copySize(element, attribute: kAXSizeAttribute as String),
    size.width > 0,
    size.height > 0
  else {
    return nil
  }

  return CGRect(origin: origin, size: size)
}

private func copyParent(_ element: AXUIElement) -> AXUIElement? {
  guard let value = copyAttributeValue(element, attribute: kAXParentAttribute as String) else {
    return nil
  }
  return value as! AXUIElement
}

private func copyActionNames(_ element: AXUIElement) -> [String] {
  var actions: CFArray?
  let result = AXUIElementCopyActionNames(element, &actions)
  guard result == .success, let names = actions as? [String] else {
    return []
  }
  return names
}

private func supportsPress(_ element: AXUIElement) -> Bool {
  copyActionNames(element).contains(kAXPressAction as String)
}

private func nearestPressableElement(for element: AXUIElement) -> AXUIElement? {
  var current: AXUIElement? = element
  var depth = 0

  while let node = current, depth < 6 {
    if supportsPress(node) {
      return node
    }
    current = copyParent(node)
    depth += 1
  }

  return nil
}

private func isEditableRole(_ role: String?) -> Bool {
  guard let role else { return false }
  return role == "AXTextArea" ||
    role == "AXTextField" ||
    role == "AXSearchField" ||
    role == "AXComboBox"
}

private func leftClick(at point: CGPoint) {
  let source = CGEventSource(stateID: .combinedSessionState)
  let move = CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)
  let down = CGEvent(mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left)
  let up = CGEvent(mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)
  move?.post(tap: .cghidEventTap)
  down?.post(tap: .cghidEventTap)
  up?.post(tap: .cghidEventTap)
}

private func postKeyboardEvent(keyCode: CGKeyCode, flags: CGEventFlags = []) {
  let source = CGEventSource(stateID: .combinedSessionState)
  let down = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true)
  let up = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: false)
  down?.flags = flags
  up?.flags = flags
  down?.post(tap: .cghidEventTap)
  up?.post(tap: .cghidEventTap)
}

private func pressElement(_ element: AXUIElement) -> Bool {
  if supportsPress(element) {
    return AXUIElementPerformAction(element, kAXPressAction as CFString) == .success
  }

  if let frame = copyFrame(element) {
    leftClick(at: CGPoint(x: frame.midX, y: frame.midY))
    return true
  }

  return false
}

private func focusedElement(in appElement: AXUIElement) -> AXUIElement? {
  guard let value = copyAttributeValue(appElement, attribute: kAXFocusedUIElementAttribute as String) else {
    return nil
  }
  return value as! AXUIElement
}

private func collectElements(
  from element: AXUIElement,
  visited: inout Set<String>,
  output: inout [AXUIElement]
) {
  let key = elementKey(element)
  guard visited.insert(key).inserted else {
    return
  }

  output.append(element)

  for attribute in childAttributes {
    guard let value = copyAttributeValue(element, attribute: attribute) else {
      continue
    }

    if CFGetTypeID(value) == AXUIElementGetTypeID() {
      collectElements(from: value as! AXUIElement, visited: &visited, output: &output)
      continue
    }

    if let children = value as? [AXUIElement] {
      for child in children {
        collectElements(from: child, visited: &visited, output: &output)
      }
    }
  }
}

private func findConversationTarget(
  root: AXUIElement,
  title: String
) -> AXUIElement? {
  let normalizedTarget = normalizeForMatch(title)
  guard !normalizedTarget.isEmpty else {
    return nil
  }

  var visited = Set<String>()
  var elements: [AXUIElement] = []
  collectElements(from: root, visited: &visited, output: &elements)

  var best: (score: Int, element: AXUIElement)? = nil

  for element in elements {
    let strings = copyStringValues(element)
    guard !strings.isEmpty else { continue }

    let bestStringScore = strings.reduce(0) { partial, string in
      let normalized = normalizeForMatch(string)
      if normalized == normalizedTarget {
        return max(partial, 100)
      }
      if normalized.contains(normalizedTarget) || normalizedTarget.contains(normalized) {
        return max(partial, 70)
      }
      return partial
    }

    guard bestStringScore > 0 else { continue }
    guard let target = nearestPressableElement(for: element) ?? (copyFrame(element) != nil ? element : nil) else {
      continue
    }

    let role = copyRole(target) ?? ""
    let roleBonus: Int
    switch role {
    case "AXButton", "AXRow":
      roleBonus = 20
    case "AXStaticText":
      roleBonus = 5
    default:
      roleBonus = 10
    }

    let score = bestStringScore + roleBonus
    if best == nil || score > best!.score {
      best = (score, target)
    }
  }

  return best?.element
}

private func findComposerElement(
  appElement: AXUIElement,
  root: AXUIElement?
) -> AXUIElement? {
  if let focused = focusedElement(in: appElement), isEditableRole(copyRole(focused)) {
    return focused
  }

  guard let root else { return nil }

  var visited = Set<String>()
  var elements: [AXUIElement] = []
  collectElements(from: root, visited: &visited, output: &elements)

  let editableElements = elements.compactMap { element -> (AXUIElement, CGRect)? in
    guard isEditableRole(copyRole(element)), let frame = copyFrame(element) else {
      return nil
    }
    return (element, frame)
  }

  return editableElements
    .sorted { lhs, rhs in
      if abs(lhs.1.minY - rhs.1.minY) > 12 {
        return lhs.1.minY > rhs.1.minY
      }
      return lhs.1.width > rhs.1.width
    }
    .first?.0
}

private func sendViaPasteboard(_ text: String) {
  let pasteboard = NSPasteboard.general
  let previous = pasteboard.string(forType: .string)
  pasteboard.clearContents()
  pasteboard.setString(text, forType: .string)
  usleep(120_000)
  postKeyboardEvent(keyCode: 9, flags: .maskCommand) // v
  usleep(120_000)
  postKeyboardEvent(keyCode: 36) // return
  usleep(120_000)

  pasteboard.clearContents()
  if let previous {
    pasteboard.setString(previous, forType: .string)
  }
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

private func recognizeOCRHits(on image: CGImage) -> [OCRHit] {
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

  return hits.sorted { lhs, rhs in
    if abs(lhs.rect.midY - rhs.rect.midY) > 0.03 {
      return lhs.rect.midY > rhs.rect.midY
    }
    return lhs.rect.minX < rhs.rect.minX
  }
}

private func performOCR(on image: CGImage) -> [String] {
  var lines: [String] = []
  appendUnique(recognizeOCRHits(on: image).map(\.text), to: &lines)
  return lines
}

private func windowBounds(from windowInfo: [String: Any]) -> CGRect? {
  guard let rawBounds = windowInfo[kCGWindowBounds as String] else {
    return nil
  }
  return CGRect(dictionaryRepresentation: rawBounds as! CFDictionary)
}

private func screenPoint(for hit: OCRHit, in bounds: CGRect) -> CGPoint {
  CGPoint(
    x: bounds.minX + (hit.rect.midX * bounds.width),
    y: bounds.minY + ((1 - hit.rect.midY) * bounds.height)
  )
}

private func findBestOCRHit(_ hits: [OCRHit], matching title: String) -> OCRHit? {
  let normalizedTarget = normalizeForMatch(title)
  guard !normalizedTarget.isEmpty else {
    return nil
  }

  return hits.max { lhs, rhs in
    func score(_ hit: OCRHit) -> Int {
      let normalized = normalizeForMatch(hit.text)
      if normalized == normalizedTarget {
        return 100
      }
      if normalized.contains(normalizedTarget) || normalizedTarget.contains(normalized) {
        return 70
      }
      return 0
    }

    return score(lhs) < score(rhs)
  }.flatMap { hit in
    let normalized = normalizeForMatch(hit.text)
    if normalized == normalizedTarget ||
      normalized.contains(normalizedTarget) ||
      normalizedTarget.contains(normalized)
    {
      return hit
    }
    return nil
  }
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

if let sendText = config.sendText {
  app.activate(options: [.activateIgnoringOtherApps])
  usleep(350_000)

  let sendFocusedWindow =
    copyAttributeValue(appElement, attribute: kAXFocusedWindowAttribute as String)
      .map { $0 as! AXUIElement }
  let sendWindows =
    (copyAttributeValue(appElement, attribute: kAXWindowsAttribute as String) as? [AXUIElement]) ?? []
  let sendRootWindow = sendFocusedWindow ?? sendWindows.first
  let sendWindowInfo = bestWindowInfo(for: app)

  if let conversationTitle = config.conversationTitle?.trimmingCharacters(in: .whitespacesAndNewlines),
    !conversationTitle.isEmpty
  {
    if let sendRootWindow,
      let target = findConversationTarget(root: sendRootWindow, title: conversationTitle)
    {
      guard pressElement(target) else {
        stderr("Found '\(conversationTitle)' but could not activate it.")
        exit(7)
      }
    } else if
      let sendWindowInfo,
      let sendBounds = windowBounds(from: sendWindowInfo),
      #available(macOS 14.0, *),
      let windowNumber = sendWindowInfo[kCGWindowNumber as String] as? NSNumber,
      let image = captureWindowImage(windowId: CGWindowID(windowNumber.uint32Value)),
      let hit = findBestOCRHit(recognizeOCRHits(on: image), matching: conversationTitle)
    {
      leftClick(at: screenPoint(for: hit, in: sendBounds))
    } else {
      stderr("Could not find a selectable Antigravity conversation titled '\(conversationTitle)'. Open it in Antigravity first or keep it visible in the sidebar.")
      exit(6)
    }

    usleep(350_000)
  }

  let refreshedRootWindow =
    copyAttributeValue(appElement, attribute: kAXFocusedWindowAttribute as String)
      .map { $0 as! AXUIElement } ?? sendRootWindow

  guard let composer = findComposerElement(appElement: appElement, root: refreshedRootWindow) else {
    if let sendWindowInfo, let sendBounds = windowBounds(from: sendWindowInfo) {
      leftClick(
        at: CGPoint(
          x: sendBounds.midX,
          y: sendBounds.maxY - 56
        )
      )
      usleep(180_000)
      sendViaPasteboard(sendText)
      print("sent")
      exit(0)
    }

    stderr("Could not find the Antigravity message composer.")
    exit(8)
  }

  if let frame = copyFrame(composer) {
    leftClick(at: CGPoint(x: frame.midX, y: frame.midY))
    usleep(180_000)
  }

  sendViaPasteboard(sendText)
  print("sent")
  exit(0)
}

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
