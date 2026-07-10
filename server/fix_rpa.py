import os

TARGET = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'pages', 'RpaConfig.jsx')

with open(TARGET, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace all fetch('/api/projects') calls with localStorage reads
# Find and replace the entire useEffect blocks

old_block_start = "  useEffect(() => {"
old_block_end = "  }, []);"

# Find first occurrence
idx1 = content.find(old_block_start)
# Find the matching closing for the first useEffect
idx_close1 = content.find(old_block_end, idx1) + len(old_block_end)

# Find second useEffect after the first
remainder = content[idx_close1:]
idx2_offset = remainder.find(old_block_start)
idx2 = idx_close1 + idx2_offset
idx_close2 = content.find(old_block_end, idx2) + len(old_block_end)

# Replace the two useEffect blocks
new_use_effect = """  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem('keyword-dashboard-projects');
        if (raw) setProjects(JSON.parse(raw));
      } catch {}
    };
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);"""

content = content[:idx1] + new_use_effect + content[idx_close2:]
print(f"Replaced useEffects from index {idx1} to {idx_close2}")

with open(TARGET, 'w', encoding='utf-8') as f:
    f.write(content)
print("RpaConfig updated")
