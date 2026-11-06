/**
 * An absolute path on one of this PC's drives, as the file dialog and Explorer give them: a drive
 * letter, a colon and a backslash, then no further colon (which would name an alternate data
 * stream).
 */
const LOCAL_DRIVE_PATH = /^[A-Za-z]:\\[^:]*$/;
const CONTROL_CHARACTERS = /\p{Cc}/u;
/** The longest path Windows accepts, in UTF-16 code units. */
export const MAX_WINDOWS_PATH_LENGTH = 32_767;

/**
 * True only for a path that can be read without contacting another computer or a device: network
 * paths (`\\server\share\…`), device and long paths (`\\?\…`, `\\.\…`) and relative paths are
 * refused, before anything touches the file system (THREAT_MODEL.md T43).
 */
export function isLocalDrivePath(value: string): boolean {
  return (
    value.length <= MAX_WINDOWS_PATH_LENGTH &&
    LOCAL_DRIVE_PATH.test(value) &&
    !CONTROL_CHARACTERS.test(value)
  );
}
