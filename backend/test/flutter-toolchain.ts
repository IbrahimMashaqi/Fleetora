import { existsSync } from 'node:fs';
import path from 'node:path';

/** Local override for test hosts; ordinary installations resolve through PATH. */
export function flutterExecutable(): string {
  const configured = process.env.FLEETORA_FLUTTER_BIN;
  if (configured) {
    if (!path.isAbsolute(configured) || !existsSync(configured))
      throw new Error(
        'FLEETORA_FLUTTER_BIN must name an installed Flutter executable',
      );
    return configured;
  }
  return process.platform === 'win32' ? 'flutter.bat' : 'flutter';
}
