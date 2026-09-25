"""Configure the generated Gradle project; signing material stays outside Git."""
import base64
import os
from pathlib import Path

names = ('ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD')
values = [os.environ.get(name, '') for name in names]
if not any(values):
    print('Nessuna chiave Android: la release sarà non firmata; disponibile anche APK debug.')
    raise SystemExit(0)
if not all(values):
    raise SystemExit('Firma Android incompleta: configurare tutti e quattro i secret documentati.')
project = Path('src-tauri/gen/android')
keystore = project / 'release.jks'
keystore.write_bytes(base64.b64decode(values[0], validate=True))
keystore.chmod(0o600)
gradle = project / 'app/build.gradle.kts'
source = gradle.read_text()
anchor = 'android {'
if source.count(anchor) != 1:
    raise SystemExit('Struttura Gradle inattesa: configurazione firma non applicata.')
source = source.replace(anchor, '''android {
    signingConfigs {
        create("release") {
            storeFile = rootProject.file("release.jks")
            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("ANDROID_KEY_ALIAS")
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
''', 1)
# Apply after generated buildTypes so the release configuration already exists.
source += '\nandroid.buildTypes.getByName("release").signingConfig = android.signingConfigs.getByName("release")\n'
gradle.write_text(source)
print('Firma Android release configurata.')
