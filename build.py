#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build the single-file scriptorium.html from scriptorium.src.html by inlining the vendored
editor engine (Toast UI Editor + plugins, MIT). Markers in the template:
    <!--@@CSS:relative/path.css@@-->   -> <style>...</style>
    <!--@@JS:relative/path.js@@-->     -> <script>...</script>
Paths are relative to .build/node_modules. Run `npm install` in .build/ first (see README)."""
import io, os, re, subprocess, sys
HERE=os.path.dirname(os.path.abspath(__file__))
SRC=os.path.join(HERE,"scriptorium.src.html"); OUT=os.path.join(HERE,"scriptorium.html")
NM=os.path.join(HERE,".build","node_modules")
PKGS=["@toast-ui/editor@3.2.2","@toast-ui/editor-plugin-color-syntax@3.1.0","@toast-ui/editor-plugin-code-syntax-highlight@3.1.0","prismjs","esbuild","mermaid@11","katex@0.16"]
if not os.path.isdir(os.path.join(NM,"@toast-ui","editor")) or not os.path.isdir(os.path.join(NM,"mermaid")) or not os.path.isdir(os.path.join(NM,"katex")):
    os.makedirs(os.path.join(HERE,".build"),exist_ok=True)
    print("vendor engine missing -> npm install into .build/ ...")
    subprocess.check_call(["npm","install","--no-audit","--no-fund","--silent"]+PKGS,cwd=os.path.join(HERE,".build"),shell=(os.name=="nt"))
ENGINE=os.path.join(HERE,".build","engine.js")
if not os.path.isfile(ENGINE) or os.path.getmtime(ENGINE)<os.path.getmtime(os.path.join(HERE,"engine.entry.js")):
    if not os.path.isdir(os.path.join(NM,"esbuild")):
        subprocess.check_call(["npm","install","--no-audit","--no-fund","--silent","esbuild","prismjs"],cwd=os.path.join(HERE,".build"),shell=(os.name=="nt"))
    print("bundling engine.js with esbuild ...")
    import shutil; shutil.copyfile(os.path.join(HERE,"engine.entry.js"),os.path.join(HERE,".build","entry.js"))   # resolve deps from .build/node_modules
    subprocess.check_call(["npx","--no-install","esbuild","entry.js","--bundle","--format=iife","--minify","--target=es2019","--outfile="+ENGINE,"--log-level=warning"],cwd=os.path.join(HERE,".build"),shell=(os.name=="nt"))
tpl=io.open(SRC,encoding="utf-8").read()
def inline(m):
    kind,rel=m.group(1),m.group(2); p=os.path.join(NM,rel)
    body=io.open(p,encoding="utf-8").read()
    if kind=="JS":
        body=body.replace("</script>","<\\/script>")           # never terminate our own script tag
        return "<script>/* %s */\n%s\n</script>"%(rel,body)
    body=body.replace("</style>","<\\/style>")
    # fonts referenced by the CSS (KaTeX) become data: URIs so the single file stays self-contained;
    # keep only the woff2 face, drop the woff/ttf alternates that would 404 from a lone .html
    import base64
    def font(mm):
        fp=os.path.join(os.path.dirname(p),mm.group(1))
        if not os.path.isfile(fp): return mm.group(0)
        return "url(data:font/woff2;base64,%s)"%base64.b64encode(open(fp,"rb").read()).decode("ascii")
    body=re.sub(r"url\((fonts/[^)]+\.woff2)\)",font,body)
    body=re.sub(r",url\(fonts/[^)]+\.(?:woff|ttf)\) format\((?:\"|')?(?:woff|truetype)(?:\"|')?\)","",body)
    return "<style>/* %s */\n%s\n</style>"%(rel,body)
out,n=re.subn(r"<!--@@(CSS|JS):(.+?)@@-->",inline,tpl)
import datetime
stamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
out,ns=re.subn(re.escape("@@BUILDSTAMP@@"),stamp,out)
print("build stamp: %s (%d)"%(stamp,ns))
io.open(OUT,"w",encoding="utf-8").write(out)
print("built %s  (%d inlines, %.1f MB)"%(OUT,n,len(out.encode("utf-8"))/1e6))
