import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { addDays, subDays } from 'date-fns';
import { useSession } from 'next-auth/react';

interface TelemetryPoint {
  ts: string;
  value: number | null;
  unit: string | null;
}

interface MetricOption {
  key: string;
  label: string;
}

export default function TelemetryTab({ assetId }: { assetId: string }) {
  const { data: session } = useSession();
  const [metric, setMetric] = useState('temp_c');
  const [bucket, setBucket] = useState<'raw' | '5m'>('5m');
  const [range, setRange] = useState<{ from: Date; to: Date }>({ from: subDays(new Date(), 1), to: new Date() });
  const [data, setData] = useState<TelemetryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<MetricOption[]>([
    { key: 'temp_c', label: 'Temperatura (°C)' },
    { key: 'rms_g', label: 'Vibración RMS (g)' },
    { key: 'speed_rpm', label: 'Velocidad (RPM)' }
  ]);

  async function loadTelemetry() {
    if (!assetId || !session?.user?.tenantId) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        metric,
        bucket,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      });
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/assets/${assetId}/telemetry?${qs.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${session?.user?.accessToken}`,
            'x-tenant': session?.user?.tenantSlug || '',
          },
        },
      );
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Error loading telemetry', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTelemetry();
  }, [metric, bucket, range]);

  return (
    <Card className="w-full">
      <CardHeader className="flex justify-between items-center">
        <CardTitle>Telemetría</CardTitle>
        <div className="flex gap-2 items-center">
          <Select value={metric} onValueChange={setMetric}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Métrica" />
            </SelectTrigger>
            <SelectContent>
              {metrics.map((m) => (
                <SelectItem key={m.key} value={m.key}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={bucket} onValueChange={(v: 'raw' | '5m') => setBucket(v)}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="raw">Crudo</SelectItem>
              <SelectItem value="5m">5 min</SelectItem>
            </SelectContent>
          </Select>
          <DateRangePicker value={range} onChange={setRange} maxDate={new Date()} />
          <Button onClick={loadTelemetry} disabled={loading}>
            {loading ? 'Cargando…' : 'Actualizar'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="ts" tickFormatter={(t) => new Date(t).toLocaleTimeString()} minTickGap={50} />
            <YAxis />
            <Tooltip
              labelFormatter={(t) => new Date(t).toLocaleString()}
              formatter={(v, name, props) => [v, `${metric}${props.payload.unit ? ' (' + props.payload.unit + ')' : ''}`]}
            />
            <Line type="monotone" dataKey="value" stroke="#2563eb" dot={false} strokeWidth={1.5} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
