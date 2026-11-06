import { MAX_DEVICE_NAME_LENGTH, MAX_DROPPED_PATHS } from '../ipc/contract';
import { MAX_WINDOWS_PATH_LENGTH } from '../outbox/localFilePath';
import { isOutboxId } from '../outbox/outboxId';
import { isStringArray, isUuid } from '../shared/validation';

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

export const outboxIdArgument: ArgumentParser<[string]> = (args) => {
  const [id] = args;
  return args.length === 1 && isOutboxId(id) ? [id] : undefined;
};

/**
 * The paths of a drop, from the preload script. Each is checked again before anything reads it,
 * and the user confirms them first.
 */
export const droppedPathsArgument: ArgumentParser<[readonly string[]]> = (args) => {
  const [paths] = args;
  return args.length === 1 && isPathList(paths) ? [paths] : undefined;
};

/** 1 to `MAX_DROPPED_PATHS` strings, none longer than Windows allows a path to be. */
export function isPathList(value: unknown): value is readonly string[] {
  return (
    isStringArray(value) &&
    value.length > 0 &&
    value.length <= MAX_DROPPED_PATHS &&
    value.every((item) => item.length <= MAX_WINDOWS_PATH_LENGTH)
  );
}
