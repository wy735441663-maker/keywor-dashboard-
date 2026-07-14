import sys, json, urllib.request, os, glob, subprocess, time

BASE = 'https://keywor-dashboard.onrender.com'
UPLOAD_JSON_URL = BASE + '/api/upload-merged-data'
DATA_URL = BASE + '/api/merged-data'
MERGE_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'server', 'merge_excel.py')

def run_local_merge(data_dir, output_dir):
    """Run merge_excel.py locally"""
    env = os.environ.copy()
    env['SELLER_DATA_DIR'] = data_dir
    env['OUTPUT_DIR'] = output_dir
    result = subprocess.run(
        [sys.executable, MERGE_SCRIPT],
        env=env, capture_output=True, text=True, timeout=60
    )
    if result.returncode != 0:
        print(f'Merge failed: {result.stderr[:300]}')
        return None
    # Parse output
    for line in result.stdout.strip().split('\n'):
        if '[OK]' in line:
            print(line.strip())
    output_file = os.path.join(output_dir, 'merged-data.json')
    if os.path.exists(output_file):
        with open(output_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None

def upload_merged_data(data, retries=5):
    """Upload merged JSON to Render"""
    body = json.dumps(data, ensure_ascii=False).encode('utf-8')
    last_err = None
    for i in range(retries):
        try:
            req = urllib.request.Request(
                UPLOAD_JSON_URL,
                data=body,
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode())
        except Exception as e:
            last_err = e
            if i < retries - 1:
                print(f'  Retry {i+2}/{retries}...')
                time.sleep(3)
    raise last_err

def check_data():
    try:
        req = urllib.request.Request(DATA_URL)
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
            if data:
                dates = sorted(set(r['date'] for r in data))
                return len(data), dates[-1]
    except:
        pass
    return 0, 'N/A'

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python upload.py <data-folder-path>')
        sys.exit(1)

    data_dir = sys.argv[1]
    if not os.path.isdir(data_dir):
        print(f'Error: {data_dir} is not a directory')
        sys.exit(1)

    output_dir = os.path.dirname(os.path.abspath(__file__))

    # Step 1: Local merge
    print('Step 1: Local merge...')
    data = run_local_merge(data_dir, output_dir)
    if not data:
        print('ERROR: Local merge failed')
        sys.exit(1)
    sp_count = sum(1 for r in data if (r.get('adType') or '').strip() == 'SP')
    print(f'  {len(data)} rows, {sp_count} SP keywords')

    # Step 2: Upload to Render
    print('Step 2: Upload to Render...')
    result = upload_merged_data(data)
    print(f'  OK: {result["count"]} rows uploaded')

    # Step 3: Verify
    print('Step 3: Verify...')
    time.sleep(2)
    rows, latest = check_data()
    if rows > 0:
        print(f'  Render: {rows} rows, latest {latest}')
    else:
        print('  Warning: Could not verify (server may be waking up)')

    print('\nDone!')
