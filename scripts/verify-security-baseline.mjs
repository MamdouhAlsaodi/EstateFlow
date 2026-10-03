import { execFileSync } from "node:child_process";

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function isSensitivePath(path) {
  const parts = path.split("/");
  const base = parts.at(-1);
  const lowerBase = base.toLowerCase();
  const sourceFile = /\.(?:[cm]?[jt]s|tsx?|jsx?)$/i.test(base);
  if (/^\.env(?:\..*)?$/.test(lowerBase) && base !== ".env.example")
    return true;
  if (/(?:private[-_.]?key|\.pem$|\.key$|\.p12$|\.pfx$)/i.test(lowerBase))
    return true;
  const sensitiveDirs = new Set([
    "credentials",
    "credential",
    "oauth",
    ".ssh",
    ".aws",
    ".gnupg",
    "secrets",
    "private",
  ]);
  if (
    parts.slice(0, -1).some((part) => {
      const name = part.toLowerCase();
      return (
        sensitiveDirs.has(name) &&
        !(sourceFile && ["credentials", "credential", "oauth"].includes(name))
      );
    })
  )
    return true;
  if (/(?:credential|oauth)/i.test(base) && !sourceFile) return true;
  return false;
}

try {
  const index = execFileSync(
    "git",
    ["-c", `safe.directory=${process.cwd()}`, "ls-files", "--stage", "-z"],
    { encoding: "buffer" },
  );
  if (index.length && index[index.length - 1] !== 0)
    throw new Error("malformed index output");
  const records = index.toString("utf8").split("\0").filter(Boolean);
  const findings = [];
  for (const record of records) {
    const match =
      /^(100644|100755|120000) ([0-9a-f]{40,64}) ([0-3])\t([\s\S]+)$/.exec(
        record,
      );
    if (!match) throw new Error("malformed index record");
    const [, mode, oid, stage, path] = match;
    if (stage !== "0") throw new Error("unmerged index");
    if (mode === "120000") {
      findings.push("tracked symlink");
      continue;
    }
    if (isSensitivePath(path)) {
      findings.push("sensitive tracked path");
      continue;
    }
    const blob = execFileSync(
      "git",
      ["-c", `safe.directory=${process.cwd()}`, "cat-file", "blob", oid],
      { encoding: "buffer" },
    );
    if (
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/.test(
        blob.toString("utf8"),
      )
    )
      findings.push("private-key PEM marker");
  }
  if (findings.length)
    fail(
      `Security baseline failed (${findings.length} finding(s)); sensitive details are suppressed.`,
    );
  else
    process.stdout.write(
      `Security baseline passed (${records.length} staged index entries checked).\n`,
    );
} catch {
  fail(
    "Security baseline failed: git index/blob inspection error; paths and contents suppressed.",
  );
}
