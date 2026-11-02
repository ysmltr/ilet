import { MAX_DEVICE_NAME_LENGTH } from '../ipc/contract';
import { isUuid } from '../shared/validation';

/** The typed arguments of a message, or `undefined` unless they are exactly what the channel takes. */
export type ArgumentParser<Args extends readonly unknown[]> = (
  args: readonly unknown[],
) => Args | undefined;

export const noArguments: ArgumentParser<[]> = (args) => (args.length === 0 ? [] : undefined);

export const deviceIdArgument: ArgumentParser<[string]> = (args) => {
  const [id] = args;
  return args.length === 1 && isUuid(id) ? [id] : undefined;
};

export const renameDeviceArguments: ArgumentParser<[string, string]> = (args) => {
  const [id, name] = args;
  return args.length === 2 &&
    isUuid(id) &&
    typeof name === 'string' &&
    name.length <= MAX_DEVICE_NAME_LENGTH
    ? [id, name]
    : undefined;
};

export const booleanArgument: ArgumentParser<[boolean]> = (args) => {
  const [value] = args;
  return args.length === 1 && typeof value === 'boolean' ? [value] : undefined;
};
