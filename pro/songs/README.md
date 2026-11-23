# Songs

Every `.txt` file here shows up in Lead Sheet's song list (tagged GitHub) the next time the app opens.
The format is the app's own text export (Songs → Export this song as text).

- A file changed here replaces the app's copy, unless that copy was edited in the app; then the edited
  copy is kept too, as "… (my edits)".
- A song deleted in the app stays deleted, even if its file is still here.
- After adding or changing a file, run `python3 tools/stamp.py` to refresh `index.json`, then push.

This repo is public, so these files are public too.
