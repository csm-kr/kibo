// The public repository that evidence links point to. The owner is the one value to confirm when the repo is
// published (phases/14-final step 9).
export const REPO_OWNER = "csm-kr";
export const REPO_URL = `https://github.com/${REPO_OWNER}/kibo`;

/** GitHub link to a repo path on main; a path ending in "/" is a folder. */
export function repoLink(path: string): string {
  const folder = path.endsWith("/");
  return `${REPO_URL}/${folder ? "tree" : "blob"}/main/${folder ? path.slice(0, -1) : path}`;
}
