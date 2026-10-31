export interface ReleaseFiles {
  tag: string;
  manifest: { version?: unknown; minAppVersion?: unknown };
  pkg: { version?: unknown };
  versions: Record<string, unknown>;
}

export function releaseVersionErrors(files: ReleaseFiles): string[];
