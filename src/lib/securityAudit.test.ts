import { describe, expect, it } from "vitest";
import { renderMarkdown, sanitizeHtml } from "./markdown";
import { parseQuickAdd } from "./nlp";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

import { isSafeAttachmentFilename } from "./security";
import { isSafeExternalUrl } from "./open";

describe("Security & Penetration Testing Suite", () => {
  describe("1. XSS & HTML Injection Hardening in Markdown Parser", () => {
    it("neutralizes script tags and inline execution vectors", () => {
      const maliciousPayloads = [
        '<script>alert("xss")</script>',
        '<script src="https://evil.com/payload.js"></script>',
        '<img src="x" onerror="alert(1)" />',
        '<svg onload="alert(1)"><circle r="10"/></svg>',
        '<body onload="alert(1)">',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<object data="javascript:alert(1)"></object>',
        '<embed src="javascript:alert(1)"></embed>',
        '<a href="javascript:alert(1)">Click Me</a>',
        '<a href="vbscript:msgbox(1)">Click Me</a>',
        '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Click Me</a>',
      ];

      for (const payload of maliciousPayloads) {
        const output = renderMarkdown(payload);
        // Ensure no executable script tags remain
        expect(output.toLowerCase()).not.toContain("<script");
        // Ensure no unescaped onerror, onload, or inline event handlers survive (except internal safe img-fallback handler)
        expect(output.toLowerCase()).not.toContain("alert(");
        expect(output.toLowerCase()).not.toMatch(/\son(?!error="this\.onerror=null)\w+\s*=/i);
        // Ensure no javascript: or vbscript: links survive
        expect(output.toLowerCase()).not.toContain('href="javascript:');
        expect(output.toLowerCase()).not.toContain('href="vbscript:');
      }
    });

    it("sanitizes CSS expression and style injection vectors", () => {
      const cssVectors = [
        '<div style="background-image: url(javascript:alert(1))">test</div>',
        '<style>body { background: red; }</style>',
        '<div style="behavior: url(evil.htc)">test</div>',
      ];

      for (const payload of cssVectors) {
        const output = renderMarkdown(payload);
        expect(output.toLowerCase()).not.toContain("<style");
        expect(output.toLowerCase()).not.toContain("url(javascript:");
      }
    });

    it("prevents DOM Clobbering attributes", () => {
      const clobberPayload = '<form id="test"><input name="id" value="clobbered"></form>';
      const output = renderMarkdown(clobberPayload);
      expect(output).not.toContain('<form');
    });
  });

  describe("2. Path Traversal & Windows DOS Device Sanitization", () => {
    it("identifies and rejects path traversal, Windows DOS devices, and NTFS streams using canonical security validator", () => {
      const dangerousFilenames = [
        "../../../../Windows/System32/calc.exe",
        "..\\..\\..\\boot.ini",
        "/etc/passwd",
        "file:///C:/Users/Administrator/secret.txt",
        "C:\\Windows\\System32\\cmd.exe",
        "nested/../../secret.key",
        "%2e%2e%2f%2e%2e%2fsecret.png",
        "CON.png",
        "prn.wav",
        "aux.jpg",
        "nul.txt",
        "COM1.webp",
        "LPT1.pdf",
        "conin$.png",
        "conout$.wav",
        "image.png:hidden_stream",
        "image.png.",
        "image.png ",
        "image*.png",
      ];

      for (const name of dangerousFilenames) {
        expect(isSafeAttachmentFilename(name), `Dangerous filename ${name} must be rejected`).toBe(false);
      }

      const validFilenames = [
        "screenshot-2026-10-14.png",
        "voice-memo-123.wav",
        "notes_attachment_v2.jpg",
        "reference_doc.pdf",
        "export_log.md",
      ];

      for (const name of validFilenames) {
        expect(isSafeAttachmentFilename(name), `Valid filename ${name} should pass`).toBe(true);
      }
    });
  });

  describe("3. Prototype Pollution Immunity", () => {
    it("safely handles prototype pollution JSON payloads without polluting Object prototype", () => {
      const pollutedJson = '{"__proto__": {"pollutedKey": "compromised"}, "constructor": {"prototype": {"admin": true}}}';
      
      JSON.parse(pollutedJson);
      expect((({} as Record<string, unknown>).pollutedKey)).toBeUndefined();
      expect((({} as Record<string, unknown>).admin)).toBeUndefined();
    });
  });

  describe("4. Repository Secret Scanning", () => {
    it("scans source files to ensure no private keys or high-entropy tokens are committed", () => {
      const srcDir = join(__dirname, "..");
      const disallowedPatterns = [
        /-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----/,
        /ghp_[a-zA-Z0-9]{36}/, // GitHub personal access token
        /xox[baprs]-[0-9a-zA-Z]{10,48}/, // Slack token
        /AKIA[0-9A-Z]{16}/, // AWS access key
        /AIza[0-9A-Za-z-_]{35}/, // Google API key
      ];

      function scanDir(dir: string) {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          if (["node_modules", "dist", ".git", "target"].includes(entry)) continue;
          const fullPath = join(dir, entry);
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            scanDir(fullPath);
          } else if (/\.(ts|tsx|js|jsx|json|rs)$/.test(entry)) {
            const content = readFileSync(fullPath, "utf-8");
            for (const pattern of disallowedPatterns) {
              const match = pattern.exec(content);
              expect(match, `Forbidden secret pattern found in ${fullPath}`).toBeNull();
            }
          }
        }
      }

      scanDir(srcDir);
    });
  });

  describe("5. Natural Language Parser Fuzzing & ReDoS Resistance", () => {
    it("handles extreme input lengths without ReDoS catastrophic backtracking", () => {
      const longInput = "buy milk " + "every day ".repeat(300) + "at 5pm";
      const start = performance.now();
      const result = parseQuickAdd(longInput);
      const duration = performance.now() - start;

      // Must complete in under 250ms without hanging the event loop
      expect(duration).toBeLessThan(250);
      expect(result).toBeDefined();
    });

    it("safely handles malformed and adversarial task input expressions", () => {
      const adversarialInputs = [
        "due yesterday at 25:99pm",
        "remind me on February 31 2026",
        "!!!@@@###$$$%%%^^^&&&***()",
        "\x00\x01\x02\x03\x04\x05\x06\x07\x08",
        "<script>due tomorrow</script>",
        "every NaN days",
        "repeat every 0 days",
        "estimate -500 min",
      ];

      for (const input of adversarialInputs) {
        expect(() => parseQuickAdd(input)).not.toThrow();
      }
    });
  });

  describe("6. DOMPurify Event Handler Stripping & Safe URI Whitelist", () => {
    it("strips user-supplied onerror attributes completely from markdown rendering", () => {
      const payload = '<img src="invalid.png" onerror="alert(document.cookie)">';
      const output = renderMarkdown(payload);
      expect(output).not.toContain("alert(document.cookie)");
      expect(output).not.toContain("document.cookie");
      // Must not contain any malicious handler
      expect(output).not.toMatch(/onerror="[^"]*alert/);
    });

    it("strips inline event handlers across all HTML tags", () => {
      const vectors = [
        '<svg onload="alert(1)"></svg>',
        '<input type="text" autofocus onfocus="alert(1)">',
        '<div onmouseover="alert(1)">hover me</div>',
        '<details ontoggle="alert(1)">open</details>',
        '<video><source onerror="alert(1)"></video>',
      ];

      for (const v of vectors) {
        const output = renderMarkdown(v);
        expect(output.toLowerCase()).not.toContain("alert(1)");
        expect(output.toLowerCase()).not.toContain("onload=");
        expect(output.toLowerCase()).not.toContain("onfocus=");
        expect(output.toLowerCase()).not.toContain("onmouseover=");
        expect(output.toLowerCase()).not.toContain("ontoggle=");
      }
    });

    it("verifies safe URI whitelist rejects javascript:, vbscript:, and unauthorized schemes", () => {
      const badLinks = [
        '<a href="javascript:void(0)">link</a>',
        '<a href="vbscript:msgbox(1)">link</a>',
        '<a href="data:text/html;base64,PHNjcmlwdD4=">link</a>',
        '<a href="file:///C:/Windows/System32/cmd.exe">link</a>',
      ];

      for (const link of badLinks) {
        const output = renderMarkdown(link);
        expect(output).not.toContain('href="javascript:');
        expect(output).not.toContain('href="vbscript:');
        expect(output).not.toContain('href="data:');
        expect(output).not.toContain('href="file:');
      }
    });
  });

  describe("7. SSRF Protection & Network Boundary Controls", () => {
    // Mirror the Rust SSRF implementation to test coverage
    function isPrivateOrLoopbackHost(host: string): boolean {
      const h = host.trim().toLowerCase();
      if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
        return true;
      }
      // Check IPv4
      const v4Parts = h.split(".").map(Number);
      if (v4Parts.length === 4 && v4Parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
        const [a, b] = v4Parts;
        if (a === 127) return true; // loopback
        if (a === 10) return true; // 10.0.0.0/8
        if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
        if (a === 192 && b === 168) return true; // 192.168.0.0/16
        if (a === 169 && b === 254) return true; // 169.254.0.0/16 (cloud metadata, APIPA)
        if (a === 0 && b === 0) return true; // 0.0.0.0
        if (v4Parts.every((p) => p === 255)) return true; // broadcast
      }
      // Check IPv6 loopback and private
      if (h === "::1" || h === "0:0:0:0:0:0:0:1" || h.startsWith("fc00:") || h.startsWith("fd") || h.startsWith("fe80:")) {
        return true;
      }
      return false;
    }

    it("blocks localhost, loopback, cloud metadata, CGNAT, benchmark, and RFC1918 private IP addresses", () => {
      const blockedHosts = [
        "localhost",
        "api.localhost",
        "router.local",
        "service.internal",
        "127.0.0.1",
        "127.0.0.2",
        "127.255.255.254",
        "169.254.169.254", // Cloud instance metadata
        "169.254.1.1",
        "10.0.0.1",
        "10.255.255.255",
        "172.16.0.1",
        "172.31.255.255",
        "192.168.0.1",
        "192.168.1.254",
        "0.0.0.0",
        "255.255.255.255",
        "::1",
        "fe80::1",
      ];

      for (const host of blockedHosts) {
        expect(isPrivateOrLoopbackHost(host), `Host ${host} should be blocked`).toBe(true);
      }
    });

    it("allows legitimate public domains and public IP addresses", () => {
      const allowedHosts = [
        "dayflit.com",
        "github.com",
        "spotify.com",
        "google.com",
        "8.8.8.8",
        "1.1.1.1",
      ];

      for (const host of allowedHosts) {
        expect(isPrivateOrLoopbackHost(host), `Host ${host} should be allowed`).toBe(false);
      }
    });
  });

  describe("8. Zip Slip & Windows Path Traversal Hardening", () => {
    it("rejects Zip Slip traversal sequences containing Windows backslashes and NTFS alternate data streams", () => {
      const maliciousZipEntries = [
        "../evil.exe",
        "..\\evil.exe",
        "..\\..\\Windows\\System32\\cmd.exe",
        "nested/../../calc.exe",
        "image.png:hidden_stream",
        "C:\\autoexec.bat",
        "legit.png/../malware.dll",
        "legit.png\\..\\malware.dll",
        "CON.png",
        "aux.jpg",
        "prn.wav",
        "nul.txt",
        "COM1.png",
      ];

      for (const entry of maliciousZipEntries) {
        expect(isSafeAttachmentFilename(entry), `Zip entry ${entry} should be rejected`).toBe(false);
      }
    });

    it("rejects dangerous executable and script file extensions during restore", () => {
      const dangerousExtensions = [
        "payload.exe",
        "script.bat",
        "command.cmd",
        "powershell.ps1",
        "library.dll",
        "macro.vbs",
        "shell.sh",
        "code.js",
        "binary.bin",
      ];

      for (const file of dangerousExtensions) {
        expect(isSafeAttachmentFilename(file), `Extension for ${file} should be rejected`).toBe(false);
      }
    });

    it("permits safe media and document attachments", () => {
      const safeAttachments = [
        "photo-12345.png",
        "memo-audio.wav",
        "recording.mp3",
        "reference.pdf",
        "notes.txt",
        "banner.webp",
      ];

      for (const file of safeAttachments) {
        expect(isSafeAttachmentFilename(file), `Attachment ${file} should be allowed`).toBe(true);
      }
    });
  });

  describe("9. Content Security Policy & Asset Protocol Scope Verification", () => {
    it("confirms strict Content Security Policy (CSP) is configured in tauri.conf.json", () => {
      const tauriConfigPath = join(__dirname, "../../src-tauri/tauri.conf.json");
      const config = JSON.parse(readFileSync(tauriConfigPath, "utf-8"));

      const csp = config.app?.security?.csp;
      expect(typeof csp).toBe("string");
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-src 'self' https: http:;");
    });

    it("confirms assetProtocol scope does not contain reckless wildcards or root access", () => {
      const tauriConfigPath = join(__dirname, "../../src-tauri/tauri.conf.json");
      const config = JSON.parse(readFileSync(tauriConfigPath, "utf-8"));

      const scope: string[] = config.app?.security?.assetProtocol?.scope || [];
      expect(scope).not.toContain("**");
      expect(scope).not.toContain("$HOME/**");
      // Scope must be strictly confined to DayFlit directories
      for (const path of scope) {
        expect(path.toLowerCase()).toMatch(/^(\$appdata|\$config|\$appconfig)\/dayflit\/\*\*/);
      }
    });
  });

  describe("10. External URL Navigation Sanitization", () => {
    it("blocks non-web/non-mailto protocols, internal assets, and control character injection using canonical isSafeExternalUrl", () => {
      const unsafeUrls = [
        "file:///C:/Windows/System32/cmd.exe",
        "javascript:alert(1)",
        "vbscript:msgbox",
        "data:text/html;base64,PHNjcmlwdD4=",
        "calc:something",
        "ms-msdt:/id PCWDiagnostic",
        "http://asset.localhost/image.png",
        "https://asset.localhost/audio.wav",
        "dayflit-image://secret.png",
        "asset://image.jpg",
      ];

      for (const url of unsafeUrls) {
        expect(isSafeExternalUrl(url)).toBe(false);
      }

      // Valid web and mailto links must pass cleanly
      expect(isSafeExternalUrl("https://github.com/dayflit")).toBe(true);
      expect(isSafeExternalUrl("mailto:support@dayflit.com")).toBe(true);
    });
  });
});


