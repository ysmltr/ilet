import type {
  MdnsResponder,
  MdnsService,
  MdnsServiceDefinition,
} from '../../src/discovery/serviceAdvertiser';

/** Stands in for ciao: records what the advertiser asks for instead of using the network. */
export class FakeMdnsResponder implements MdnsResponder {
  /** "advertise", "destroy" and "shutdown", in the order they were called. */
  readonly calls: string[] = [];
  readonly definitions: MdnsServiceDefinition[] = [];
  createServiceError: Error | undefined;
  advertiseResult: () => Promise<void> = () => Promise.resolve();
  destroyResult: () => Promise<void> = () => Promise.resolve();
  private readonly nameListeners: ((name: string) => void)[] = [];

  createService(definition: MdnsServiceDefinition): MdnsService {
    if (this.createServiceError !== undefined) {
      throw this.createServiceError;
    }
    this.definitions.push(definition);
    return {
      advertise: () => {
        this.calls.push('advertise');
        return this.advertiseResult();
      },
      destroy: () => {
        this.calls.push('destroy');
        return this.destroyResult();
      },
      on: (_event, listener) => {
        this.nameListeners.push(listener);
      },
    };
  }

  shutdown(): Promise<void> {
    this.calls.push('shutdown');
    return Promise.resolve();
  }

  /** What ciao does after another device answered its probe for the name. */
  renameService(name: string): void {
    for (const listener of this.nameListeners) {
      listener(name);
    }
  }
}
