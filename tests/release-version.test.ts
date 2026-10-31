import { describe, expect, it } from "vitest";
import { releaseVersionErrors } from "../scripts/check-release-version.mjs";

const OK = {
  tag: "0.2.0",
  manifest: { version: "0.2.0", minAppVersion: "1.13.0" },
  pkg: { version: "0.2.0" },
  versions: { "0.1.0": "1.13.0", "0.2.0": "1.13.0" },
};

describe("リリースのバージョン照合", () => {
  it("タグ・manifest・package・versions.json がそろっていれば問題なし", () => {
    expect(releaseVersionErrors(OK)).toEqual([]);
  });

  it("v 付きや x.y.z 以外のタグを拒否する", () => {
    expect(releaseVersionErrors({ ...OK, tag: "v0.2.0" })).toEqual([
      'Tag "v0.2.0" must be x.y.z, without a "v" prefix.',
    ]);
    expect(releaseVersionErrors({ ...OK, tag: "0.2.0-beta.1" })).toHaveLength(1);
  });

  it("manifest.json と package.json の version がタグと違えば、それぞれ指摘する", () => {
    expect(
      releaseVersionErrors({ ...OK, manifest: { ...OK.manifest, version: "0.1.0" }, pkg: {} })
    ).toEqual([
      'manifest.json version "0.1.0" does not match tag "0.2.0".',
      'package.json version "undefined" does not match tag "0.2.0".',
    ]);
  });

  it("versions.json にそのバージョンが無いか、minAppVersion と食い違えば指摘する", () => {
    expect(releaseVersionErrors({ ...OK, versions: { "0.1.0": "1.13.0" } })).toEqual([
      'versions.json has no entry for "0.2.0".',
    ]);
    expect(releaseVersionErrors({ ...OK, versions: { "0.2.0": "1.12.0" } })).toEqual([
      'versions.json maps "0.2.0" to "1.12.0", but manifest.json minAppVersion is "1.13.0".',
    ]);
  });
});
