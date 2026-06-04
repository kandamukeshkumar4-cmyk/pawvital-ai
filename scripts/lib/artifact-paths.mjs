import { isAbsolute, relative } from "node:path";

export function repoRelativePath(path, root = process.cwd()) {
  const relativePath = relative(root, path).replace(/\\/g, "/");
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith("../") ||
    isAbsolute(relativePath)
  ) {
    return path;
  }
  return relativePath;
}
