
## Uppdatera sajtens data
1. `/usr/bin/python3 tools/export_games.py` (kräver /tmp/r2-thumbs-list.txt — `rclone lsf r2:game-thumbnails -R --files-only > /tmp/r2-thumbs-list.txt`)
2. `/usr/bin/python3 tools/encrypt_data.py [lösenord]` (default nordplay2026)
3. commit + push → Pages deployar
