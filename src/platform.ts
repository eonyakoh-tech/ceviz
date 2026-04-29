import * as os from "os";
import * as path from "path";

export type OsPlatform = "linux" | "darwin" | "win32";

export function getPlatform(): OsPlatform {
    const p = process.platform;
    if (p === "darwin" || p === "win32") { return p; }
    return "linux";
}

export function isWindows(): boolean { return getPlatform() === "win32"; }
export function isMac(): boolean     { return getPlatform() === "darwin"; }
export function isLinux(): boolean   { return getPlatform() === "linux"; }

/** Cross-platform home directory (replaces process.env.HOME). */
export function homedir(): string { return os.homedir(); }

/**
 * Expand leading `~` to the real home directory.
 * On Windows, also normalise forward slashes to backslashes.
 */
export function expandTilde(p: string): string {
    if (!p) { return p; }
    const expanded = p.startsWith("~")
        ? path.join(homedir(), p.slice(1))
        : p;
    return isWindows() ? expanded.replace(/\//g, "\\") : expanded;
}

/**
 * Return the platform-appropriate executable name.
 * On Windows, Node's `spawn` needs `.cmd` for npm-installed CLIs.
 */
export function cliExecutable(name: string): string {
    return isWindows() ? `${name}.cmd` : name;
}

/**
 * Return the platform-appropriate system shell.
 * Used as `shell:` option in child_process when a POSIX shell is needed.
 */
export function systemShell(): string {
    return isWindows() ? "powershell.exe" : "/bin/sh";
}

/** Directory where CEVIZ stores backend data and projects. */
export function cevizDataDir(): string {
    if (isWindows()) {
        return path.join(process.env.APPDATA || homedir(), "ceviz");
    }
    return path.join(homedir(), "ceviz");
}

/** Directory where per-project CONTEXT.md files are stored. */
export function projectsDir(): string {
    return path.join(cevizDataDir(), "projects");
}

/**
 * OS-specific directories to search for Obsidian Vaults.
 * Ordered by likelihood of containing a vault.
 */
export function defaultVaultSearchDirs(): string[] {
    const home = homedir();
    if (isWindows()) {
        const docs = process.env.USERPROFILE
            ? path.join(process.env.USERPROFILE, "Documents")
            : path.join(home, "Documents");
        return [
            docs,
            path.join(home, "Obsidian"),
            path.join(home, "OneDrive", "Documents"),
            home,
        ];
    }
    if (isMac()) {
        return [
            path.join(home, "Documents"),
            path.join(home, "Obsidian"),
            // iCloud Drive
            path.join(home, "Library", "Mobile Documents",
                       "iCloud~md~obsidian", "Documents"),
            home,
        ];
    }
    // Linux
    return [
        path.join(home, "Documents"),
        path.join(home, "Obsidian"),
        home,
    ];
}

/** Ollama binary default install path per OS. */
export function ollamaExecutablePath(): string {
    if (isWindows()) { return path.join("C:", "Users", os.userInfo().username, "AppData", "Local", "Programs", "Ollama", "ollama.exe"); }
    if (isMac())     { return "/usr/local/bin/ollama"; }
    return "/usr/local/bin/ollama";
}

/** CEVIZ config directory (plist / service files). */
export function serviceConfigDir(): string {
    if (isMac()) {
        return path.join(homedir(), "Library", "LaunchAgents");
    }
    if (isWindows()) {
        return path.join(process.env.APPDATA || homedir(), "ceviz", "services");
    }
    // Linux: systemd user unit directory
    return path.join(homedir(), ".config", "systemd", "user");
}

/** Human-readable OS label for display in UI. */
export function platformLabel(): string {
    switch (getPlatform()) {
        case "darwin": return "macOS";
        case "win32":  return "Windows";
        default:       return "Linux";
    }
}

/**
 * Install-script filename for the current OS.
 * Returned path is relative to the extension's `scripts/` directory.
 */
export function installScriptName(): string {
    switch (getPlatform()) {
        case "darwin": return "install-macos.sh";
        case "win32":  return "install-windows.ps1";
        default:       return "install-linux.sh";
    }
}
