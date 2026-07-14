import os, sys, json, glob
from datetime import datetime
from collections import defaultdict

try:
    import openpyxl
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl", "-q"])
    import openpyxl

DATA_DIR = os.environ.get("SELLER_DATA_DIR", "C:/Users/Administrator/Desktop/文件夹/AI学习/try/卖家精灵下载数据")
OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "/tmp" if os.name != "nt" else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dist"))
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "merged-data.json")
NOT_FOUND_RANK = 999

COLUMN_DEFS = [
    ("date",       ["时间", "日期"],       ["date"],        "date"),
    ("keyword",    ["关键词"],              ["keyword"],     "str"),
    ("translation",["关键词翻译"],          ["translat"],    "str"),
    ("asin",       ["原ASIN", "ASIN"],     ["asin"],        "str"),
    ("adType",     ["广告排名", "广告类型"], ["ad_type", "adtype"], "str"),
    ("pos_ad",     ["绝对位置(含ad)"],      [],              "rank"),
    ("pos_nat",    ["绝对位置"],            [],              "rank"),
    ("aba",        ["ABA周排名"],           ["aba"],         "int"),
    ("search_vol", ["月搜索量"],            ["search", "vol"], "int"),
    ("purchase",   ["购买率"],              ["purchase", "rate"], "float"),
]

FIELD_MAP = {
    "pos_nat": "绝对位置",
    "pos_ad": "绝对位置(含ad)",
    "aba": "ABA周排名",
    "search_vol": "月搜索量",
    "purchase": "购买率",
}

def identify_column(header):
    h = str(header).strip() if header else ""
    if not h:
        return None
    for field, exact_list, latin_list, typ in COLUMN_DEFS:
        for em in exact_list:
            if h == em:
                return field
        for lk in latin_list:
            if lk.lower() in h.lower():
                return field
    return None

def parse_value(value, typ):
    if value is None:
        return (NOT_FOUND_RANK if typ == "rank" else None)
    if typ == "date":
        if hasattr(value, "strftime"):
            return value.strftime("%Y-%m-%d")
        s = str(value).strip()
        for fmt in ["%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y"]:
            try: return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
            except: pass
        return s
    if typ == "str":
        return str(value).strip()
    if typ == "rank":
        try: return int(float(value))
        except:
            vs = str(value).strip()
            return NOT_FOUND_RANK if len(vs) > 3 else 0
    if typ == "int":
        try: return int(float(value))
        except: return 0
    if typ == "float":
        try: return float(value)
        except: return 0.0
    return str(value).strip()

def rename_fields(record):
    out = {}
    for k, v in record.items():
        out[FIELD_MAP.get(k, k)] = v
    return out

def read_excel(filepath):
    wb = openpyxl.load_workbook(filepath, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 2:
        return []
    headers = [str(h).strip() if h else "" for h in rows[0]]
    col_map = {}
    for i, h in enumerate(headers):
        field = identify_column(h)
        if field:
            col_map[i] = field
    data = []
    for row in rows[1:]:
        if row[0] is None:
            continue
        record = {}
        for i, value in enumerate(row):
            if i not in col_map:
                continue
            field = col_map[i]
            typ = next((d[3] for d in COLUMN_DEFS if d[0] == field), "str")
            val = parse_value(value, typ)
            if val is not None:
                record[field] = val
        if record.get("date") and record.get("keyword"):
            if "asin" not in record:
                record["asin"] = ""
            data.append(rename_fields(record))
    return data

def main():
    xlsx_files = glob.glob(os.path.join(DATA_DIR, "*.xlsx"))
    all_files = sorted([f for f in xlsx_files if not os.path.basename(f).startswith("~")])
    if not all_files:
        print(f"[ERROR] No files: {DATA_DIR}")
        return
    print(f"Files: {len(all_files)}")
    all_data = []
    for fp in all_files:
        try:
            d = read_excel(fp)
            print(f"  {os.path.basename(fp)}: {len(d)} rows")
            all_data.extend(d)
        except Exception as e:
            print(f"  {os.path.basename(fp)} FAIL: {e}")

    if not all_data:
        print("[ERROR] No data")
        return

    groups = defaultdict(list)
    for d in all_data:
        key = (d.get("date"), d.get("keyword"), d.get("asin"))
        groups[key].append(d)

    merged = []
    sp_count = 0
    for key, rows in groups.items():
        if len(rows) == 1:
            r = rows[0]
            at = (r.get("adType") or "").strip()
            if at != "SP":
                r["绝对位置(含ad)"] = NOT_FOUND_RANK
            merged.append(r)
        else:
            base = dict(rows[0])
            nat_rank = NOT_FOUND_RANK
            sp_rank = NOT_FOUND_RANK
            has_sp = False
            for r in rows:
                at = (r.get("adType") or "").strip()
                if at == "SP":
                    v = r.get("绝对位置(含ad)", NOT_FOUND_RANK)
                    if v < NOT_FOUND_RANK:
                        sp_rank = v
                        has_sp = True
                    if r.get("translation"):
                        base["translation"] = r.get("translation")
                else:
                    v = r.get("绝对位置", NOT_FOUND_RANK)
                    if v < NOT_FOUND_RANK:
                        nat_rank = v
                    if r.get("translation"):
                        base["translation"] = r.get("translation")
            base["绝对位置"] = nat_rank
            base["绝对位置(含ad)"] = sp_rank
            base["adType"] = "SP" if has_sp else ""
            merged.append(base)
            if has_sp:
                sp_count += 1

    merged.sort(key=lambda x: (x.get("date",""), x.get("keyword","")))
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    # 先写临时文件，再原子替换，防止并发读取到半截文件
    tmp_file = OUTPUT_FILE + ".tmp"
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
    os.replace(tmp_file, OUTPUT_FILE)
    print(f"[OK] {len(merged)} rows (SP: {sp_count}) -> {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
