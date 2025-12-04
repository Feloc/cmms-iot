'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const OverviewTab = dynamic(() => import('./tabs/OverviewTab'), { ssr: false });
const TelemetryTab = dynamic(() => import('./tabs/TelemetryTab'), { ssr: false });
const ConfigTab = dynamic(() => import('./tabs/ConfigTab'), { ssr: false });

export default function DeviceDetailPage() {
  const { id } = useParams();
  const [active, setActive] = useState('overview');

  if (!id) return <div className="p-4 text-gray-500">Cargando...</div>;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Detalle del Dispositivo</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={active} onValueChange={setActive}>
          <TabsList className="mb-4">
            <TabsTrigger value="overview">General</TabsTrigger>
            <TabsTrigger value="telemetry">Telemetría</TabsTrigger>
            <TabsTrigger value="config">Configuración</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab deviceId={id as string} />
          </TabsContent>
          <TabsContent value="telemetry">
            <TelemetryTab deviceId={id as string} />
          </TabsContent>
          <TabsContent value="config">
            <ConfigTab deviceId={id as string} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
