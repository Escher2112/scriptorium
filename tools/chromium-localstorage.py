#!/usr/bin/env python3
"""Read a Chromium localStorage LevelDB directory (write-ahead .log + snappy .ldb tables) and dump the values whose
key contains a substring — how a Scriptorium session (scr_chats, scr_ai_trace, scr_tabs) is recovered from a running
browser without DevTools. Stdlib only. Tags: value byte 0x00 = UTF-16LE, 0x01 = Latin-1.
    python tools/chromium-localstorage.py ~/.config/chromium/Default/"Local Storage"/leveldb scr_ /tmp/out"""
import sys,os,glob,struct,json
def varint(b,i):
    r=0;s=0
    while True:
        c=b[i]; i+=1; r|=(c&0x7f)<<s; s+=7
        if c<0x80: return r,i
def snappy(b):
    n,i=varint(b,0); out=bytearray()
    while i<len(b):
        t=b[i]; i+=1; tag=t&3
        if tag==0:
            l=t>>2
            if l<60: l+=1
            else:
                nb=l-59; l=int.from_bytes(b[i:i+nb],'little')+1; i+=nb
            out+=b[i:i+l]; i+=l
        else:
            if tag==1: l=((t>>2)&7)+4; off=((t>>5)<<8)|b[i]; i+=1
            elif tag==2: l=(t>>2)+1; off=int.from_bytes(b[i:i+2],'little'); i+=2
            else: l=(t>>2)+1; off=int.from_bytes(b[i:i+4],'little'); i+=4
            for _ in range(l): out.append(out[-off])
    return bytes(out)
def block(b,off,size):
    data=b[off:off+size]; typ=b[off+size]
    return snappy(data) if typ==1 else data
def block_entries(blk):
    nres=struct.unpack('<I',blk[-4:])[0]; end=len(blk)-4-4*nres; i=0; key=b''
    while i<end:
        shared,i=varint(blk,i); non,i=varint(blk,i); vl,i=varint(blk,i)
        key=key[:shared]+blk[i:i+non]; i+=non; val=blk[i:i+vl]; i+=vl
        yield key,val
def read_ldb(path):
    b=open(path,'rb').read(); foot=b[-48:]
    mo,i=varint(foot,0); ms,i=varint(foot,i); io_,i=varint(foot,i); isz,i=varint(foot,i)
    idx=block(b,io_,isz)
    for k,v in block_entries(idx):
        bo,j=varint(v,0); bs,j=varint(v,j)
        for key,val in block_entries(block(b,bo,bs)):
            ukey=key[:-8]; seq=struct.unpack('<Q',key[-8:])[0]; typ=seq&0xff
            if typ==1: yield ukey,val
def read_log(path):
    b=open(path,'rb').read(); pos=0; cur=b''
    def recs():
        nonlocal pos,cur
        while pos+7<=len(b):
            if (pos%32768)>32768-7: pos+=(32768-(pos%32768)); continue
            crc,length,typ=struct.unpack('<IHB',b[pos:pos+7]); pos+=7; data=b[pos:pos+length]; pos+=length
            if typ==1: yield data; cur=b''
            elif typ==2: cur=data
            elif typ==3: cur+=data
            elif typ==4: cur+=data; yield cur; cur=b''
            elif typ==0: return
    for rec in recs():
        if len(rec)<12: continue
        n=struct.unpack('<I',rec[8:12])[0]; i=12
        try:
            for _ in range(n):
                t=rec[i]; i+=1; kl,i=varint(rec,i); key=rec[i:i+kl]; i+=kl
                if t==1: vl,i=varint(rec,i); val=rec[i:i+vl]; i+=vl; yield key,val
        except Exception: pass
d,sub,out=sys.argv[1],sys.argv[2].encode(),sys.argv[3]
vals={}
files=sorted(glob.glob(os.path.join(d,'*.ldb')),key=os.path.getmtime)+sorted(glob.glob(os.path.join(d,'*.log')),key=os.path.getmtime)
for f in files:
    try: it=read_ldb(f) if f.endswith('.ldb') else read_log(f)
    except Exception as e: print("skip",f,e); continue
    for key,val in it:
        if sub in key:
            k=key.split(b'\x00')[-1].lstrip(b'\x00\x01').decode('latin-1')
            vals[k]=val[1:].decode('utf-16le' if val[:1]==b'\x00' else 'latin-1',errors='replace')
print("keys:",{k:len(v) for k,v in vals.items()})
for k,v in vals.items():
    try: j=json.loads(v); open(os.path.join(out,k+'.json'),'w').write(json.dumps(j)); print("wrote",k, "items" if isinstance(j,list) else "", len(j) if isinstance(j,(list,dict)) else "")
    except Exception as e: open(os.path.join(out,k+'.txt'),'w').write(v)
