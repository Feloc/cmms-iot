'use client';

import React from 'react';

export default function OverviewTab({ asset }: { asset: any }) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="border rounded-lg p-4 space-y-2">
        <h2 className="font-semibold">Información básica</h2>
        <div className="grid grid-cols-2 gap-x-4 text-sm">
          <div className="text-gray-500">Código</div>
          <div className="font-mono">{asset.code}</div>
          <div className="text-gray-500">Nombre</div>
          <div>{asset.name}</div>
          <div className="text-gray-500">Marca / Modelo</div>
          <div>{asset.brand || '—'} / {asset.model || '—'}</div>
          <div className="text-gray-500">N° Serie</div>
          <div>{asset.serialNumber || '—'}</div>
          <div className="text-gray-500">Estado</div>
          <div>{asset.status || '—'}</div>
          <div className="text-gray-500">Criticidad</div>
          <div>{asset.criticality || '—'}</div>
          <div className="text-gray-500">Potencia nominal</div>
          <div>{asset.nominalPower ?? '—'} {asset.nominalPowerUnit ?? ''}</div>
          <div className="text-gray-500">Adquirido</div>
          <div>{asset.acquiredOn ? new Date(asset.acquiredOn).toISOString().slice(0,10) : '—'}</div>
        </div>
      </div>
      <div className="border rounded-lg p-4 space-y-2">
        <h2 className="font-semibold">Integración IoT</h2>
        <div className="grid grid-cols-2 gap-x-4 text-sm">
          <div className="text-gray-500">ingestKey</div>
          <div className="font-mono">{asset.ingestKey || '—'}</div>
          <div className="text-gray-500">Creado</div>
          <div>{asset.createdAt ? new Date(asset.createdAt).toLocaleString() : '—'}</div>
          <div className="text-gray-500">Actualizado</div>
          <div>{asset.updatedAt ? new Date(asset.updatedAt).toLocaleString() : '—'}</div>
        </div>
      </div>
    </section>
  );
}