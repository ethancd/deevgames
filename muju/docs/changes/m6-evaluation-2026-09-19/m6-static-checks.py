import json, pathlib, subprocess, sys, time
out = pathlib.Path(sys.argv[1])
rows=[]
commands=[(name, ["node", "node_modules/typescript/bin/tsc", "-p", cfg, "--noEmit"]) for name,cfg in [("app","tsconfig.json"),("lab","lab/tsconfig.json"),("ai-lab","lab/ai/tsconfig.json"),("server","server/tsconfig.json"),("engine-seat","tools/engine-seat/tsconfig.json")]]
commands += [("hard-deps", ["node","--import","tsx","lab/hard-ai/deps.ts"]),("dag-check", ["python3","../tools/muju-content-dag.py","check"]),("dag-plan", ["python3","../tools/muju-content-dag.py","plan","--kind","ai","--kind","ai-strength","--format","json"])]
for name,cmd in commands:
    start=time.time()
    with (out/(name+".log")).open("xb") as log:
        result=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT)
    rows.append(dict(name=name,command=cmd,exitCode=result.returncode,elapsedSeconds=time.time()-start))
    print(json.dumps(rows[-1]),flush=True)
(out/"checks.json").write_text(json.dumps(rows,indent=2)+"\n")
sys.exit(0 if all(r["exitCode"]==0 for r in rows) else 1)
