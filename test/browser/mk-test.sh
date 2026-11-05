#!/bin/sh
# Rigenera test/browser/test.html da index.html: librerie locali, niente
# rete, niente service worker. Da rilanciare a ogni modifica dell'app.
python3 - "$@" <<'PY'
import re,os,shutil
Q=os.path.dirname(os.path.abspath("test/browser/mk-test.sh"))
src=open('index.html').read()
cdn=re.compile(r'  <script src="https://cdnjs[^\n]*\n'*4+r'  <script src="https://cdn\.jsdelivr[^\n]*\n  <link href="https://fonts[^\n]*\n')
vendor=('  <script src="vendor/react.production.min.js"></script>\n'
        '  <script src="vendor/react-dom.production.min.js"></script>\n'
        '  <script src="vendor/babel.min.js"></script>\n'
        '  <script src="vendor/xlsx.full.min.js"></script>\n  \n')
src,n=cdn.subn(vendor,src)
assert n==1,"tag delle librerie non trovati"
sw=re.compile(r'<script>/\* la shell viene sempre ripresa[\s\S]*?</script>\n')
src,n=sw.subn('\n',src)
assert n==1,"blocco service worker non trovato"
open('test/browser/test.html','w').write(src)
shutil.copy('version.json','test/browser/version.json')
print("test.html rigenerato")
PY
