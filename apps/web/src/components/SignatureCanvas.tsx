'use client';

import { useEffect, useRef, useState } from 'react';

export function SignatureCanvas(props: {
  label: string;
  initialDataUrl?: string | null;
  onChange?: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    if (!props.initialDataUrl) return;
    const img = new Image();
    img.onload = () => {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
    };
    img.src = props.initialDataUrl;
  }, [props.initialDataUrl]);

  function pos(e: PointerEvent) {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current;
    if (!c) return;
    c.setPointerCapture(e.pointerId);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const p = pos(e.nativeEvent);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    setDrawing(true);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const p = pos(e.nativeEvent);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function end() {
    setDrawing(false);
    const c = canvasRef.current;
    if (!c) return;
    const data = c.toDataURL('image/png');
    props.onChange?.(data);
  }

  function clear() {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    props.onChange?.(null);
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{props.label}</div>
      <canvas
        ref={canvasRef}
        width={520}
        height={180}
        className="border rounded w-full bg-white touch-none"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={() => drawing && end()}
      />
      <button type="button" className="text-sm underline text-gray-700" onClick={clear}>
        Limpiar
      </button>
    </div>
  );
}
