import AppKit
import Foundation

final class CodexCNApp: NSObject, NSApplicationDelegate {
    private let bundledToolRelativePath = "CodexCNPlusPlus/scripts/run-codex-cn.js"
    private let guiPath = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let menu = NSMenu()
    private var isRunning = false
    private var statusMenuItem = NSMenuItem(title: "状态：待检查", action: nil, keyEquivalent: "")
    private var applyMenuItem = NSMenuItem(title: "应用汉化", action: #selector(applyLocalization), keyEquivalent: "")
    private var restoreMenuItem = NSMenuItem(title: "恢复最近备份", action: #selector(restoreBackup), keyEquivalent: "")

    func applicationDidFinishLaunching(_ notification: Notification) {
        if let button = statusItem.button {
            if let image = NSImage(named: "CodexCNPlusPlus") {
                image.size = NSSize(width: 18, height: 18)
                image.isTemplate = false
                button.image = image
                button.imagePosition = .imageLeft
                button.title = " CN++"
            } else {
                button.title = "CN++"
            }
            button.toolTip = "Codex CN++"
        }

        applyMenuItem.target = self
        restoreMenuItem.target = self

        let refresh = NSMenuItem(title: "刷新状态", action: #selector(refreshStatus), keyEquivalent: "r")
        refresh.target = self
        let openUi = NSMenuItem(title: "打开网页界面", action: #selector(openUI), keyEquivalent: "o")
        openUi.target = self
        let openLogs = NSMenuItem(title: "打开日志", action: #selector(openLogs), keyEquivalent: "l")
        openLogs.target = self
        let quit = NSMenuItem(title: "退出", action: #selector(quit), keyEquivalent: "q")
        quit.target = self

        menu.addItem(statusMenuItem)
        menu.addItem(.separator())
        menu.addItem(applyMenuItem)
        menu.addItem(restoreMenuItem)
        menu.addItem(refresh)
        menu.addItem(.separator())
        menu.addItem(openUi)
        menu.addItem(openLogs)
        menu.addItem(.separator())
        menu.addItem(quit)
        statusItem.menu = menu

        refreshStatus()
    }

    @objc private func refreshStatus() {
        runAction(title: "刷新状态", command: "status", successTitle: "状态检查完成")
    }

    @objc private func applyLocalization() {
        runAction(title: "应用汉化", command: "apply", successTitle: "应用汉化完成")
    }

    @objc private func restoreBackup() {
        runAction(title: "恢复最近备份", command: "restore", successTitle: "恢复完成")
    }

    @objc private func openUI() {
        runAction(title: "打开网页界面", command: "open-ui", successTitle: "网页界面已打开")
    }

    @objc private func openLogs() {
        let logDir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Logs/Codex CN++")
        NSWorkspace.shared.open(logDir)
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }

    private func runAction(title: String, command: String, successTitle: String) {
        guard !isRunning else { return }
        setRunning(true, title: "\(title)中")
        DispatchQueue.global(qos: .userInitiated).async {
            let result = self.runTool(command)
            DispatchQueue.main.async {
                self.setRunning(false, title: result.ok ? "CN++" : "失败")
                self.statusMenuItem.title = result.ok ? "状态：\(successTitle)" : "状态：\(title)失败"
                self.notify(title: result.ok ? successTitle : "\(title)失败", message: result.summary)
            }
        }
    }

    private func setRunning(_ running: Bool, title: String) {
        isRunning = running
        statusItem.button?.title = running ? "CN++…" : title
        applyMenuItem.isEnabled = !running
        restoreMenuItem.isEnabled = !running
        statusMenuItem.title = running ? "状态：处理中..." : statusMenuItem.title
    }

    private func runTool(_ command: String) -> (ok: Bool, summary: String) {
        let process = Process()
        let launch = nodeLaunch(command: command)
        process.executableURL = launch.executableURL
        process.arguments = launch.arguments
        process.currentDirectoryURL = URL(fileURLWithPath: toolRoot())
        process.environment = processEnvironment()

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe

        do {
            try process.run()
            process.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: data, encoding: .utf8) ?? ""
            appendLog(output)
            return (process.terminationStatus == 0, summarize(output))
        } catch {
            appendLog(error.localizedDescription)
            return (false, error.localizedDescription)
        }
    }

    private func toolRoot() -> String {
        guard let resourcePath = Bundle.main.resourcePath else {
            return FileManager.default.currentDirectoryPath
        }
        return URL(fileURLWithPath: resourcePath)
            .appendingPathComponent("CodexCNPlusPlus")
            .path
    }

    private func toolPath() -> String {
        guard let resourcePath = Bundle.main.resourcePath else {
            return URL(fileURLWithPath: toolRoot()).appendingPathComponent("scripts/run-codex-cn.js").path
        }
        return URL(fileURLWithPath: resourcePath)
            .appendingPathComponent(bundledToolRelativePath)
            .path
    }

    private func nodeLaunch(command: String) -> (executableURL: URL, arguments: [String]) {
        for candidate in nodeCandidates() {
            if FileManager.default.isExecutableFile(atPath: candidate) {
                return (URL(fileURLWithPath: candidate), [toolPath(), command])
            }
        }
        return (URL(fileURLWithPath: "/usr/bin/env"), ["node", toolPath(), command])
    }

    private func nodeCandidates() -> [String] {
        var candidates: [String] = []
        if let resourcePath = Bundle.main.resourcePath {
            candidates.append(URL(fileURLWithPath: resourcePath)
                .appendingPathComponent("node/bin/node")
                .path)
        }
        candidates.append(contentsOf: [
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node",
        ])
        return candidates
    }

    private func processEnvironment() -> [String: String] {
        var environment = ProcessInfo.processInfo.environment
        let existingPath = environment["PATH"] ?? ""
        environment["PATH"] = existingPath.isEmpty ? guiPath : "\(guiPath):\(existingPath)"
        return environment
    }

    private func summarize(_ output: String) -> String {
        let trimmed = output.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "没有输出。" }
        if let data = trimmed.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let changed = json["changedFiles"] as? [[String: Any]] {
                return "变更文件：\(changed.count)"
            }
            if let files = json["files"] as? [[String: Any]] {
                let matches = json["matches"] as? Int ?? 0
                return "扫描文件：\(files.count)，命中文案：\(matches)"
            }
            if let restored = json["restoredFiles"] as? [String] {
                return "恢复文件：\(restored.count)"
            }
        }
        return String(trimmed.prefix(180))
    }

    private func appendLog(_ text: String) {
        let dir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Logs/Codex CN++")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let file = dir.appendingPathComponent("menubar.log")
        let entry = "\n[\(Date())]\n\(text)\n"
        if let data = entry.data(using: .utf8) {
            if FileManager.default.fileExists(atPath: file.path),
               let handle = try? FileHandle(forWritingTo: file) {
                _ = try? handle.seekToEnd()
                try? handle.write(contentsOf: data)
                try? handle.close()
            } else {
                try? data.write(to: file)
            }
        }
    }

    private func notify(title: String, message: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.addButton(withTitle: "好")
        alert.runModal()
    }
}

let app = NSApplication.shared
let delegate = CodexCNApp()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
