import { describe, expect, it } from "vitest";
import {
  APATCH_FLAVORS,
  KERNELSU_REQUIRED_MANAGER,
  MAGISK_REQUIRED_MANAGER,
  MANAGER_APPS,
  managerApp,
} from "@/core";

/**
 * Every manager a provider can record in a plan has to be reachable: the whole point of the link on
 * the result page is that the app the image requires can actually be obtained. A new provider whose
 * constant is missing here fails this test instead of shipping a dead end.
 */
describe("manager apps", () => {
  it("has an official release page for every manager a provider can require", () => {
    for (const packageName of [
      MAGISK_REQUIRED_MANAGER,
      KERNELSU_REQUIRED_MANAGER,
      ...APATCH_FLAVORS.map((flavor) => flavor.managerPackage),
    ]) {
      const app = managerApp(packageName);
      expect(app, packageName).toBeDefined();
      expect(app?.releaseUrl).toMatch(/^https:\/\//);
      expect(app?.name.length).toBeGreaterThan(0);
    }
  });

  it("says nothing about a package it does not know", () => {
    expect(managerApp("com.example.unknown")).toBeUndefined();
  });

  it("keeps every entry distinct and well formed", () => {
    const packages = MANAGER_APPS.map((entry) => entry.packageName);
    expect(new Set(packages).size).toBe(packages.length);
    for (const entry of MANAGER_APPS) {
      expect(entry.packageName).toMatch(/^[a-z][a-z0-9_.]+$/);
      expect(entry.releaseUrl).toMatch(/^https:\/\/github\.com\/.+\/releases$/);
    }
  });
});
