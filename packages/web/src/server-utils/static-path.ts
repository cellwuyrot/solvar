import path from "node:path";

/** A lexical containment check, portable across native and simulated OS paths. */
export function isWithinDirectory(
  directory: string,
  candidate: string,
  paths: Pick<typeof path, "relative" | "isAbsolute" | "sep"> = path,
): boolean {
  const relative = paths.relative(directory, candidate);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${paths.sep}`) &&
    !paths.isAbsolute(relative)
  );
}

/** Backslashes and NUL are not valid URL path separators for static requests. */
export function staticFilePath(directory: string, pathname: string): string | null {
  if (!pathname.startsWith("/") || pathname.includes("\\") || pathname.includes("\0")) return null;
  const candidate = path.resolve(directory, `.${pathname}`);
  return isWithinDirectory(directory, candidate) ? candidate : null;
}
