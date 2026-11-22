import urllib.request, json

url = "https://api.github.com/repos/kipsway/k-project/actions/runs"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
try:
    handler = urllib.request.ProxyHandler({})
    opener = urllib.request.build_opener(handler)
    with opener.open(req) as r:
        data = json.loads(r.read().decode())
        runs = data.get("workflow_runs", [])
        for run in runs[:6]:
            print(f"Run #{run['id']}: {run['name']} -> {run['status']} ({run['conclusion']}) | commit: {run.get('head_commit', {}).get('message', '').splitlines()[0]}")
except Exception as e:
    print("Error:", e)
