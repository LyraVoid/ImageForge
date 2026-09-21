import type { ArtifactRegistry } from "../../artifacts/registry";
import type { PatchProvider, PatchProviderDescriptor } from "../types";
import { MOCK_PROVIDER_DESCRIPTOR, PLANNED_PROVIDER_DESCRIPTORS } from "./descriptors";
import { MockPatchProvider } from "./mock-provider";

export class ProviderRegistry {
  private readonly implementations = new Map<string, PatchProvider>();
  private readonly descriptorsById = new Map<string, PatchProviderDescriptor>();

  register(provider: PatchProvider, descriptor?: PatchProviderDescriptor): void {
    this.implementations.set(provider.id, provider);
    if (descriptor) this.descriptorsById.set(descriptor.id, descriptor);
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
}

export function createProviderRegistry(artifacts: ArtifactRegistry): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(new MockPatchProvider(artifacts), MOCK_PROVIDER_DESCRIPTOR);
  for (const descriptor of PLANNED_PROVIDER_DESCRIPTORS) registry.registerDescriptor(descriptor);
  return registry;
}
