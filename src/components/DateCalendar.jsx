import { useState, useMemo, useRef, useEffect } from 'react';

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export default function DateCalendar({ dates, selectedDate, onSelect }) {
  const [viewYear, setViewYear] = useState(() => {
    if (selectedDate) return parseInt(selectedDate.split('-')[0]);
    return new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    if (selectedDate) return parseInt(selectedDate.split('-')[1]) - 1;
    return new Date().getMonth();
  });
  const [showPicker, setShowPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(viewYear);
  const pickerRef = useRef(null);

  const dateSet = useMemo(() => new Set(dates), [dates]);

  // 关闭弹窗（点击外部）
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const startDow = firstDay.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, date: ds, hasData: dateSet.has(ds) });
    }
    return cells;
  }, [viewYear, viewMonth, dateSet]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };

  const selectMonth = (m) => {
    setViewMonth(m);
    setViewYear(pickerYear);
    setShowPicker(false);
  };

  const isSelected = (ds) => ds === selectedDate;
  const isToday = (ds) => ds === new Date().toISOString().split('T')[0];

  return (
    <div style={{
      background: '#fff', borderRadius: 14, border: '1px solid var(--border)',
      padding: '16px 18px 12px', boxShadow: 'var(--shadow)', userSelect: 'none',
      width: 260, position: 'relative',
    }}>
      {/* 月导航 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 10, fontWeight: 600, fontSize: 14,
      }}>
        <button onClick={prevMonth} style={{
          border: 'none', background: 'none', cursor: 'pointer', fontSize: 16,
          color: 'var(--text-secondary)', padding: '2px 8px',
        }}>‹</button>
        <span
          onClick={() => { setPickerYear(viewYear); setShowPicker(!showPicker); }}
          style={{ cursor: 'pointer', padding: '2px 6px', borderRadius: 4, transition: 'background .1s' }}
          onMouseEnter={e => e.target.style.background = 'var(--bg-input)'}
          onMouseLeave={e => e.target.style.background = 'transparent'}
        >
          {viewYear}年 {MONTHS[viewMonth]}
        </span>
        <button onClick={nextMonth} style={{
          border: 'none', background: 'none', cursor: 'pointer', fontSize: 16,
          color: 'var(--text-secondary)', padding: '2px 8px',
        }}>›</button>
      </div>

      {/* 年月选择弹窗 */}
      {showPicker && (
        <div ref={pickerRef} style={{
          position: 'absolute', top: 44, left: 16, right: 16,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 12px 40px rgba(0,0,0,.12)', padding: 14, zIndex: 10,
        }}>
          {/* 年份行 */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 12, fontWeight: 600, fontSize: 14,
          }}>
            <button onClick={() => setPickerYear(pickerYear - 1)} style={{
              border: 'none', background: 'none', cursor: 'pointer', fontSize: 16,
              color: 'var(--text-secondary)', padding: '2px 8px',
            }}>‹</button>
            <span>{pickerYear}年</span>
            <button onClick={() => setPickerYear(pickerYear + 1)} style={{
              border: 'none', background: 'none', cursor: 'pointer', fontSize: 16,
              color: 'var(--text-secondary)', padding: '2px 8px',
            }}>›</button>
          </div>

          {/* 月份网格 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {MONTHS.map((m, i) => {
              const isActive = i === viewMonth && pickerYear === viewYear;
              return (
                <button
                  key={m}
                  onClick={() => selectMonth(i)}
                  style={{
                    padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: isActive ? 700 : 400,
                    background: isActive ? 'var(--blue)' : 'var(--bg-input)',
                    color: isActive ? '#fff' : 'var(--text)',
                    transition: 'all .1s',
                  }}
                >{m}</button>
              );
            })}
          </div>
        </div>
      )}

      {/* 星期 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {WEEKDAYS.map(w => (
          <div key={w} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', padding: '2px 0', fontWeight: 500 }}>
            {w}
          </div>
        ))}
      </div>

      {/* 日期网格 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {calendarDays.map((cell, i) => {
          if (!cell) return <div key={`e${i}`} />;
          const sel = isSelected(cell.date);
          const today = isToday(cell.date);
          return (
            <button key={cell.date} disabled={!cell.hasData}
              onClick={() => cell.hasData && onSelect(cell.date)}
              title={cell.date}
              style={{
                width: '100%', aspectRatio: '1',
                border: sel ? '2px solid var(--blue)' : '1px solid transparent',
                borderRadius: 6,
                background: sel ? 'var(--blue-light)' : cell.hasData ? '#fff' : '#f3f4f6',
                color: sel ? 'var(--blue)' : cell.hasData ? 'var(--text)' : '#d1d5db',
                cursor: cell.hasData ? 'pointer' : 'default',
                fontSize: 12, fontWeight: sel ? 700 : today ? 600 : 400,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all .1s',
              }}
              onMouseEnter={e => { if (cell.hasData && !sel) e.target.style.background = '#f0f4ff'; }}
              onMouseLeave={e => { if (cell.hasData && !sel) e.target.style.background = '#fff'; }}
            >{cell.day}</button>
          );
        })}
      </div>

      {/* 图例 */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        <span>{dateSet.size} 天有数据</span>
        <span style={{ color: 'var(--blue)' }}>● 已选</span>
      </div>
    </div>
  );
}
