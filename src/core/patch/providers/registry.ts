import type { ArtifactRegistry } from "../../artifacts/registry";
import type { PatchProvider, PatchProviderDescriptor, PatchRunContext, PatchVerificationResult } from "../types";
import type { ParsedImage } from "../../image";
import type { PatchOptions, PatchPlan, PatchResult } from "../types";
import {
  APATCH_PROVIDER_DESCRIPTOR,
  KERNELSU_PROVIDER_DESCRIPTOR,
  MAGISK_PROVIDER_DESCRIPTOR,
  MOCK_PROVIDER_DESCRIPTOR,
  PLANNED_PROVIDER_DESCRIPTORS,
} from "./descriptors";

/** Builds the implementation once the module that holds it has been imported. */
export type PatchProviderFactory = (artifacts: ArtifactRegistry) => PatchProvider;

/**
 * One dynamic import per implementation. Nothing here runs until a run needs that provider, so a
 * page that only lists the candidates carries no patch pipeline at all: describing a provider is
 * data (see ./descriptors), running one is code, and the two no longer travel together.
 */
export const PROVIDER_LOADERS: Record<string, () => Promise<PatchProviderFactory>> = {
  apatch: async () => {
    const module = await import("./apatch-provider");
    return (artifacts) => new module.ApatchPatchProvider(artifacts);
  },
  kernelsu: async () => {
    const module = await import("./kernelsu-provider");
    return (artifacts) => new module.KernelsuPatchProvider(artifacts);
  },
  magisk: async () => {
    const module = await import("./magisk-provider");
    return (artifacts) => new module.MagiskPatchProvider(artifacts);
  },
  // Last on purpose: the mock provider is a pipeline smoke test, not a root solution.
  mock: async () => {
    const module = await import("./mock-provider");
    return (artifacts) => new module.MockPatchProvider(artifacts);
  },
};

/**
 * A provider that behaves like the real one and imports it on the first call. Every method of
 * `PatchProvider` is asynchronous, so the only visible difference is that the first call also loads
 * a module. Concurrent first calls share one import.
 */
class LazyPatchProvider implements PatchProvider {
  readonly id: string;
  readonly name: string;
  private readonly load: () => Promise<PatchProviderFactory>;
  private readonly artifacts: ArtifactRegistry;
  private instance: PatchProvider | null = null;
  private pending: Promise<PatchProvider> | null = null;

  constructor(
    id: string,
    name: string,
    load: () => Promise<PatchProviderFactory>,
    artifacts: ArtifactRegistry,
  ) {
    this.id = id;
    this.name = name;
    this.load = load;
    this.artifacts = artifacts;
  }

  isLoaded(): boolean {
    return this.instance !== null;
  }

  private async provider(): Promise<PatchProvider> {
    if (this.instance) return this.instance;
    this.pending ??= this.load().then((factory) => factory(this.artifacts));
    try {
      this.instance = await this.pending;
    } catch (error) {
      // A failed import must not poison the registry: the next attempt may succeed (a chunk that
      // failed to load once, for example after a redeploy).
      this.pending = null;
      throw error;
    }
    return this.instance;
  }

  async analyze(image: ParsedImage, context?: PatchRunContext) {
    return (await this.provider()).analyze(image, context);
  }

  async resolve(
    image: ParsedImage,
    options: PatchOptions,
    sourceImageSha256: string,
    context?: Parameters<PatchProvider["resolve"]>[3],
  ): Promise<PatchPlan> {
    return (await this.provider()).resolve(image, options, sourceImageSha256, context);
  }

  async patch(image: ParsedImage, plan: PatchPlan, context: PatchRunContext): Promise<PatchResult> {
    return (await this.provider()).patch(image, plan, context);
  }

  async verify(result: PatchResult, context?: PatchRunContext): Promise<PatchVerificationResult> {
    return (await this.provider()).verify(result, context);
  }
}

export class ProviderRegistry {
  private readonly implementations = new Map<string, PatchProvider>();
  private readonly descriptorsById = new Map<string, PatchProviderDescriptor>();

  register(provider: PatchProvider, descriptor?: PatchProviderDescriptor): void {
    this.implementations.set(provider.id, provider);
    if (descriptor) this.descriptorsById.set(descriptor.id, descriptor);
  }

  /** Registers a provider whose module is imported the first time it is used. */
  registerLazy(
    providerId: string,
    load: () => Promise<PatchProviderFactory>,
    artifacts: ArtifactRegistry,
  ): void {
    const descriptor = this.descriptorsById.get(providerId);
    this.implementations.set(
      providerId,
      new LazyPatchProvider(providerId, descriptor?.name ?? providerId, load, artifacts),
    );
  }

  registerDescriptor(descriptor: PatchProviderDescriptor): void {
    this.descriptorsById.set(descriptor.id, descriptor);
  }

  get(providerId: string): PatchProvider | undefined {
    return this.implementations.get(providerId);
  }

  descriptor(providerId: string): PatchProviderDescriptor | undefined {
    return this.descriptorsById.get(providerId);
  }

  descriptors(): PatchProviderDescriptor[] {
    return [...this.descriptorsById.values()];
  }

  availableProviderIds(): string[] {
    return [...this.implementations.keys()];
  }

  /** Providers whose implementation has been imported so far, in registration order. */
  loadedProviderIds(): string[] {
    return [...this.implementations.entries()]
      .filter(([, provider]) => !(provider instanceof LazyPatchProvider) || provider.isLoaded())
      .map(([id]) => id);
  }
}

export function createProviderRegistry(artifacts: ArtifactRegistry): ProviderRegistry {
  const registry = new ProviderRegistry();
  const descriptors: Record<string, PatchProviderDescriptor | undefined> = {
    apatch: APATCH_PROVIDER_DESCRIPTOR,
    kernelsu: KERNELSU_PROVIDER_DESCRIPTOR,
    magisk: MAGISK_PROVIDER_DESCRIPTOR,
    mock: MOCK_PROVIDER_DESCRIPTOR,
  };
  // Descriptors first: they are what the compatibility engine and the UI read, and they decide the
  // names the lazy providers report.
  for (const descriptor of Object.values(descriptors)) {
    if (descriptor) registry.registerDescriptor(descriptor);
  }
  for (const [providerId, load] of Object.entries(PROVIDER_LOADERS)) {
    registry.registerLazy(providerId, load, artifacts);
  }
  for (const descriptor of PLANNED_PROVIDER_DESCRIPTORS) registry.registerDescriptor(descriptor);
  return registry;
}
