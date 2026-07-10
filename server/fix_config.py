import os

content = """import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'keyword-dashboard-projects';

function loadProjects() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveProjectsToLocal(projects) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function parseItems(raw) {
  if (!raw || !raw.trim()) return [];
  const cleaned = raw
    .replace(/[，,、;；]/g, '\\n')
    .replace(/\\n{2,}/g, '\\n')
    .replace(/^\\n+|\\n+$/g, '');
  return cleaned.split('\\n').map(s => s.trim()).filter(Boolean);
}

function ProjectModal({ onSave, onClose, edit }) {
  const [name, setName] = useState(edit?.name || '');
  const [asinRaw, setAsinRaw] = useState(edit ? (Array.isArray(edit.asins) ? edit.asins.join('\\n') : edit.asin || '') : '');
  const [kwRaw, setKwRaw] = useState(edit ? (Array.isArray(edit.keywords) ? edit.keywords.join('\\n') : edit.keywords || '') : '');
  const [owner, setOwner] = useState(edit?.owner || '');

  const handleSubmit = () => {
    const asins = parseItems(asinRaw);
    const keywords = parseItems(kwRaw);
    if (!name.trim()) return alert(chr(35831)+chr(36755)+chr(20837)+chr(39033)+chr(30446)+chr(21517)+chr(31216));
    if (asins.length === 0) return alert(chr(35831)+chr(36755)+chr(20837)+chr(33267)+chr(23569)+chr(19968)+chr(20010)+' ASIN');
    if (keywords.length === 0) return alert(chr(35831)+chr(36755)+chr(20837)+chr(33267)+chr(23569)+chr(19968)+chr(20010)+chr(20851)+chr(38190)+chr(35789));

    onSave({
      id: edit?.id || Date.now().toString(),
      name: name.trim(),
      asins,
      keywords,
      owner: owner.trim(),
      updatedAt: new Date().toISOString(),
    });
  };

  return null;
}

export default function Config() {
  const [projects, setProjects] = useState([]);
  return null;
}
"""

# Just test if this approach works
print("Script loaded")
print(f"Content length: {len(content)}")
