#!/usr/bin/env python3
"""games.json → gzip → AES-256-GCM → data.enc  [salt16|iv12|ct]"""
import gzip, hashlib, secrets, os, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

SP = 'REPO'
PW = (sys.argv[1] if len(sys.argv) > 1 else 'nordplay2026').encode()
raw = open(SP+'/games.json', 'rb').read()
gz = gzip.compress(raw, 9)
salt = secrets.token_bytes(16); iv = secrets.token_bytes(12)
key = hashlib.pbkdf2_hmac('sha256', PW, salt, 200_000, 32)
ct = AESGCM(key).encrypt(iv, gz, None)
open(SP+'/data.enc', 'wb').write(salt + iv + ct)
blob = open(SP+'/data.enc', 'rb').read()
k2 = hashlib.pbkdf2_hmac('sha256', PW, blob[:16], 200_000, 32)
assert gzip.decompress(AESGCM(k2).decrypt(blob[16:28], blob[28:], None)) == raw
print('data.enc', round(len(blob) / 1e6, 2), 'MB · dekryptering verifierad')
os.remove(SP+'/games.json')
