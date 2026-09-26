// Single source of truth: "version" in the root package.json (X.Z.0), bumped by .githooks/pre-commit
import { version } from '../../package.json'

export const APP_VERSION = version.split('.').slice(0, 2).join('.')
